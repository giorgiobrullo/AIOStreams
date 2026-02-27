'use client';
import React from 'react';
import { Template } from '@aiostreams/core';
import {
  SearchIcon,
  AlertTriangleIcon,
  Trash2Icon,
  CheckIcon,
} from 'lucide-react';
import { BiImport } from 'react-icons/bi';
import { Button, IconButton } from '../../../ui/button';
import { TextInput } from '../../../ui/text-input';
import { Tooltip } from '../../../ui/tooltip';
import { cn } from '../../../ui/core/styling';
import MarkdownLite from '../../markdown-lite';
import * as constants from '../../../../../../core/src/utils/constants';
import { asConfigArray } from '@/lib/templates/processors/conditionals';
import { TemplateValidation } from '@/lib/templates/types';

interface TemplateBrowseStepProps {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  selectedCategory: string;
  onCategoryChange: (v: string) => void;
  selectedSource: string;
  onSourceChange: (v: string) => void;
  categories: string[];
  sources: string[];
  filteredTemplates: Template[];
  loadingTemplates: boolean;
  templateValidations: Record<string, TemplateValidation>;
  isLoading: boolean;
  onLoadTemplate: (t: Template) => void;
  onImportOpen: () => void;
  onDeleteRequest: (t: Template) => void;
  totalTemplateCount: number;
}

export function TemplateBrowseStep({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedSource,
  onSourceChange,
  categories,
  sources,
  filteredTemplates,
  loadingTemplates,
  templateValidations,
  isLoading,
  onLoadTemplate,
  onImportOpen,
  onDeleteRequest,
  totalTemplateCount,
}: TemplateBrowseStepProps) {
  return (
    <>
      {/* Search and Filters */}
      <div className="space-y-3 min-w-0">
        <TextInput
          placeholder="Search templates..."
          value={searchQuery}
          onValueChange={onSearchChange}
          leftIcon={<SearchIcon className="w-4 h-4" />}
        />

        {/* Source Filters */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-gray-400 flex-shrink-0">Source:</span>
          <div className="flex gap-1.5 overflow-x-auto min-w-0 flex-1 pb-2">
            {sources.map((source: string) => {
              const sourceDescription: Record<string, string> = {
                all: 'All sources',
                builtin: 'Provided with AIOStreams',
                custom: 'Added by the instance hoster',
                external: 'Imported by you',
              };
              const colorClasses: Record<string, string> = {
                all: 'bg-gray-700/50 text-gray-300 hover:bg-gray-700',
                builtin:
                  selectedSource === 'builtin'
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : 'bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 border border-brand-500/20',
                custom:
                  selectedSource === 'custom'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20',
                external:
                  selectedSource === 'external'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20',
              };
              const tooltipColorClasses: Record<string, string> = {
                all: 'bg-gray-800 text-white border-gray-700',
                builtin: 'bg-brand-600 text-white border-brand-500',
                custom: 'bg-purple-600 text-white border-purple-500',
                external: 'bg-emerald-600 text-white border-emerald-500',
              };
              return (
                <Tooltip
                  key={source}
                  className={cn('mb-2', tooltipColorClasses[source])}
                  trigger={
                    <button
                      onClick={() => onSourceChange(source)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex-shrink-0 ${
                        selectedSource === source && source === 'all'
                          ? 'bg-gray-600 text-white'
                          : colorClasses[source]
                      }`}
                    >
                      {source.charAt(0).toUpperCase() + source.slice(1)}
                    </button>
                  }
                >
                  {sourceDescription[source]}
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-gray-400 flex-shrink-0">Category:</span>
          <div className="flex gap-1.5 overflow-x-auto min-w-0 flex-1 pb-2">
            {categories.map((category) => (
              <Button
                key={category}
                intent={
                  selectedCategory === category ? 'primary' : 'gray-outline'
                }
                size="sm"
                onClick={() => onCategoryChange(category)}
                className="whitespace-nowrap flex-shrink-0"
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
        {loadingTemplates ? (
          <div className="text-center py-8 text-gray-400">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No templates found matching your search
          </div>
        ) : (
          filteredTemplates.map((template) => {
            const validation = templateValidations[template.metadata.id];
            const hasWarnings = validation && validation.warnings.length > 0;
            const hasErrors = validation && validation.errors.length > 0;

            const addons = asConfigArray(template.config?.presets)
              .map((preset: any) => preset.options?.name)
              .filter((name: any) => typeof name === 'string');

            return (
              <div
                key={template.metadata.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-white truncate">
                        {template.metadata.name}
                      </h3>
                      <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded flex-shrink-0">
                        v{template.metadata.version || '1.0.0'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {template.metadata.source === 'builtin' && (
                      <span className="text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded border border-brand-500/30">
                        Built-in
                      </span>
                    )}
                    {template.metadata.source === 'custom' && (
                      <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                        Custom
                      </span>
                    )}
                    {template.metadata.source === 'external' && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                        External
                      </span>
                    )}
                    {(hasWarnings || hasErrors) && (
                      <div className="relative group">
                        <AlertTriangleIcon
                          className={`w-4 h-4 ${hasErrors ? 'text-red-400' : 'text-yellow-400'}`}
                        />
                        <div className="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw-2rem)] p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-xs">
                          {validation.errors.length > 0 && (
                            <div className="mb-2">
                              <div className="font-semibold text-red-400 mb-1">
                                Errors:
                              </div>
                              <ul className="list-disc list-inside space-y-1 text-red-300">
                                {validation.errors.map((error, idx) => (
                                  <li key={idx} className="break-words">
                                    {error}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {validation.warnings.length > 0 && (
                            <div>
                              <div className="font-semibold text-yellow-400 mb-1">
                                Warnings:
                              </div>
                              <ul className="list-disc list-inside space-y-1 text-yellow-300">
                                {validation.warnings.map((warning, idx) => (
                                  <li key={idx} className="break-words">
                                    {warning}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <MarkdownLite className="text-sm text-gray-400 mb-4">
                  {template.metadata.description}
                </MarkdownLite>

                {/* Category and Author */}
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <div className="text-gray-500 text-xs mb-1.5">Category</div>
                    <span className="text-xs bg-gray-800/60 text-gray-300 px-2 py-1 rounded inline-block">
                      {template.metadata.category}
                    </span>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs mb-1.5">Author</div>
                    <span className="text-xs text-gray-300">
                      {template.metadata.author}
                    </span>
                  </div>
                </div>

                {/* Addons */}
                {addons.length > 0 && (
                  <div className="mb-3">
                    <div className="text-gray-500 text-xs mb-1.5">Addons</div>
                    <div className="flex flex-wrap gap-1.5">
                      {addons.slice(0, 5).map((addon) => (
                        <span
                          key={addon}
                          className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded"
                        >
                          {addon}
                        </span>
                      ))}
                      {addons.length > 5 && (
                        <div className="relative group">
                          <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded cursor-pointer">
                            +{addons.length - 5} more
                          </span>
                          <div className="absolute left-0 top-full mt-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5 max-w-xs">
                              {addons.slice(5).map((addon, idx) => (
                                <span
                                  key={addon}
                                  className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded animate-in fade-in slide-in-from-top-1"
                                  style={{
                                    animationDelay: `${idx * 30}ms`,
                                    animationDuration: '200ms',
                                  }}
                                >
                                  {addon}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Services */}
                {template.metadata.services &&
                  template.metadata.services.length > 0 && (
                    <div className="mb-3">
                      <div className="text-gray-500 text-xs mb-1.5">
                        Services
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {template.metadata.services.map((service) => (
                          <span
                            key={service}
                            className="text-xs bg-green-600/30 text-green-300 px-2 py-0.5 rounded"
                          >
                            {constants.SERVICE_DETAILS[
                              service as keyof typeof constants.SERVICE_DETAILS
                            ]?.name || service}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="flex gap-2">
                  {template.metadata.source === 'external' && (
                    <IconButton
                      icon={<Trash2Icon className="w-4 h-4" />}
                      intent="alert-outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteRequest(template);
                      }}
                    />
                  )}
                  <Button
                    intent="primary"
                    size="md"
                    leftIcon={<CheckIcon className="w-4 h-4" />}
                    onClick={() => onLoadTemplate(template)}
                    loading={isLoading}
                    className="flex-1"
                  >
                    Load Template
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-gray-700">
        <div className="text-sm text-gray-400">
          {totalTemplateCount} template
          {totalTemplateCount !== 1 ? 's' : ''} available
        </div>
        <div className="flex gap-2">
          <Tooltip
            trigger={
              <IconButton
                intent="primary-outline"
                icon={<BiImport />}
                onClick={onImportOpen}
              />
            }
          >
            Import Template
          </Tooltip>
        </div>
      </div>
    </>
  );
}
