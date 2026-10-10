import { Request, Response, NextFunction } from 'express';
import {
  createLogger,
  APIError,
  constants,
  decryptString,
  validateConfig,
  Resource,
  StremioTransformer,
  UserRepository,
  Env,
  isConfigUuid,
  resolveConfigAlias,
  activateVariants,
  recordClientAgent,
  resolveVariantSelector,
  logVariantNotes,
  VARIANT_QUERY_PARAM,
  VARIANT_PATH_PARAM,
  settingsStore,
  UserData,
} from '@aiostreams/core';
import { createHash } from 'node:crypto';
import { syncUserDataUrls } from '../utils/syncUserData.js';
import { buildVariantRequestContext } from '../utils/variant-context.js';

const logger = createLogger('server');

/**
 * Validated configurations, by the configuration they were validated from.
 *
 * Validating runs on every request: it compiles the regexes, test-evaluates every stream
 * expression and initialises a whole AIOStreams instance on top of the one the route then
 * initialises again, about 20 ms of a catalog or meta request's 30. What it returns depends only
 * on the configuration handed to it and on the server settings, so the key is a hash of the
 * former (after variants, synced URLs and the client's IP are applied) and the settings version,
 * and a changed configuration is simply another key. The entries expire anyway, as validation
 * also checks API keys with their services. Each request gets its own copy: routes modify it.
 */
const VALIDATED_CONFIG_TTL_MS = 5 * 60 * 1000;
const VALIDATED_CONFIG_MAX = 100;
const validatedConfigs = new Map<string, { at: number; config: UserData }>();

async function validateConfigCached(
  userData: UserData,
  options: Parameters<typeof validateConfig>[1]
): Promise<UserData> {
  let key: string | undefined;
  try {
    key = `${settingsStore.currentVersion}:${JSON.stringify(options)}:${createHash('sha256')
      .update(JSON.stringify(userData))
      .digest('hex')}`;
    const hit = validatedConfigs.get(key);
    if (hit && Date.now() - hit.at < VALIDATED_CONFIG_TTL_MS) {
      return structuredClone(hit.config);
    }
  } catch {
    key = undefined;
  }

  const validated = await validateConfig(userData, options);
  if (key) {
    try {
      validatedConfigs.delete(key);
      validatedConfigs.set(key, { at: Date.now(), config: structuredClone(validated) });
      while (validatedConfigs.size > VALIDATED_CONFIG_MAX) {
        validatedConfigs.delete(validatedConfigs.keys().next().value!);
      }
    } catch {
      // A configuration that cannot be copied is validated on every request, as before.
    }
  }
  return validated;
}

// Valid resources that require authentication
const VALID_RESOURCES = [
  ...constants.RESOURCES,
  'manifest.json',
  'configure',
  'manifest',
  'streams',
];

const RESOURCE_REGEX = new RegExp(`/(${VALID_RESOURCES.join('|')})`);

interface UserDataParams {
  uuid?: string;
  encryptedPassword?: string;
  // match Express.Request<ParamsDictionary> to keep middleware flexible
  [key: string]: string | string[] | undefined;
}

export const userDataMiddleware = async (
  req: Request<UserDataParams>,
  res: Response,
  next: NextFunction
) => {
  const { uuid: uuidOrAlias, encryptedPassword } = req.params;

  // Both uuid and encryptedPassword should be present since we mounted the router on this path
  if (!uuidOrAlias || !encryptedPassword) {
    next(new APIError(constants.ErrorCode.USER_INVALID_DETAILS));
    return;
  }
  // First check - validate path has two components followed by valid resource
  const resourceMatch = req.path.match(RESOURCE_REGEX);
  if (!resourceMatch) {
    next();
    return;
  }

  // Second check - validate UUID format (simpler regex that just checks UUID format)
  let uuid: string | undefined;
  if (!isConfigUuid(uuidOrAlias)) {
    const alias = await resolveConfigAlias(uuidOrAlias);
    if (alias) {
      uuid = alias.uuid;
    } else {
      next(new APIError(constants.ErrorCode.USER_INVALID_DETAILS));
      return;
    }
  } else {
    uuid = uuidOrAlias;
  }

  const resource = resourceMatch[1];

  try {
    // Check if user exists
    const userExists = await UserRepository.checkUserExists(uuid);
    if (!userExists) {
      if (constants.RESOURCES.includes(resource as Resource)) {
        res.status(200).json(
          StremioTransformer.createDynamicError(resource as Resource, {
            errorDescription: 'User not found',
          })
        );
        return;
      }
      next(new APIError(constants.ErrorCode.USER_INVALID_DETAILS));
      return;
    }

    let password = undefined;

    // decrypt the encrypted password
    const { success: successfulDecryption, data: decryptedPassword } =
      decryptString(encryptedPassword);
    if (!successfulDecryption) {
      if (constants.RESOURCES.includes(resource as Resource)) {
        res.status(200).json(
          StremioTransformer.createDynamicError(resource as Resource, {
            errorDescription: 'Invalid password',
          })
        );
        return;
      }
      next(new APIError(constants.ErrorCode.ENCRYPTION_ERROR));
      return;
    }

    // Get and validate user data
    let userData = await UserRepository.getUser(uuid, decryptedPassword);

    if (!userData) {
      if (constants.RESOURCES.includes(resource as Resource)) {
        res.status(200).json(
          StremioTransformer.createDynamicError(resource as Resource, {
            errorDescription: 'Invalid password',
          })
        );
        return;
      }
      next(new APIError(constants.ErrorCode.USER_INVALID_DETAILS));
      return;
    }

    userData.encryptedPassword = encryptedPassword;
    userData.uuid = uuid;
    userData.ip = req.userIp;

    if (resource !== 'configure') {
      // Before syncUserDataUrls, since a variant may add a synced URL, and
      // before validateConfig, which is what makes the patch safe.
      try {
        const { ids: selected, location } = resolveVariantSelector(
          req.params[VARIANT_PATH_PARAM],
          req.query[VARIANT_QUERY_PARAM]
        );
        const context = buildVariantRequestContext(req, resource);
        void recordClientAgent(uuid, context.userAgent, resource);
        const result = await activateVariants(userData, selected, context);
        userData = result.userData;
        if (selected.length) {
          userData.variantSelectorLocation = location;
        }
        if (result.applied.length) {
          // Per request, so it is visible whether a client carries the
          // selector beyond the manifest.
          logger.info(
            {
              uuid,
              resource,
              variants: userData.activeVariants,
              auto: result.auto,
              location: selected.length ? location : undefined,
            },
            'serving request with config variants'
          );
          logVariantNotes(uuid, result);
        }
      } catch (error: any) {
        if (constants.RESOURCES.includes(resource as Resource)) {
          res.status(200).json(
            StremioTransformer.createDynamicError(resource as Resource, {
              errorDescription: error.message,
            })
          );
          return;
        }
        logger.warn(`Invalid variant selection for ${uuid}: ${error.message}`);
        next(
          new APIError(
            constants.ErrorCode.USER_INVALID_CONFIG,
            undefined,
            error.message
          )
        );
        return;
      }

      userData = await syncUserDataUrls(userData);

      try {
        userData = await validateConfigCached(userData, {
          skipVariantValidation: true,
          skipErrorsFromAddonsOrProxies: true,
          decryptValues: true,
        });
      } catch (error: any) {
        if (constants.RESOURCES.includes(resource as Resource)) {
          res.status(200).json(
            StremioTransformer.createDynamicError(resource as Resource, {
              errorDescription: error.message,
            })
          );
          return;
        }
        logger.error(`Invalid config for ${uuid}: ${error.message}`);
        next(
          new APIError(
            constants.ErrorCode.USER_INVALID_CONFIG,
            undefined,
            error.message
          )
        );
        return;
      }
    }

    // Attach validated data to request
    req.userData = userData;
    req.uuid = uuid;
    next();
  } catch (error: any) {
    logger.error(error.message);
    if (error instanceof APIError) {
      next(error);
    } else {
      next(new APIError(constants.ErrorCode.INTERNAL_SERVER_ERROR));
    }
  }
};
