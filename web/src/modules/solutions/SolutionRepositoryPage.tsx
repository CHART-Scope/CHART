"use client";

import { useEffect, useMemo, useState } from "react";

import {
  listPublicSolutions,
  listSolutionTaxonomies,
  type SolutionRepositoryItem,
  type SolutionRepositoryTaxonomy,
} from "../../lib/solutionRepositoryClient";
import type { ChartRoute } from "../routes/types";
import {
  SolutionRepositoryDetailDrawer,
  SolutionRepositoryGrid,
} from "./SolutionRepositoryComponents";
import "./SolutionRepositoryPage.css";

type SolutionRepositoryPageProps = {
  onNavigate: (route: ChartRoute) => void;
};

type RepositoryFilterOption = {
  id: string;
  label: string;
};

const healthImplicationTaxonomyTypes = new Set([
  "health_implication",
  "health_implications",
  "health_outcome",
  "health_outcomes",
]);

export function SolutionRepositoryPage(_props: SolutionRepositoryPageProps) {
  const [items, setItems] = useState<SolutionRepositoryItem[]>([]);
  const [taxonomies, setTaxonomies] = useState<SolutionRepositoryTaxonomy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRepository() {
      setIsLoading(true);

      try {
        const [solutionResponse, taxonomyResponse] = await Promise.all([
          listPublicSolutions({ limit: "100" }),
          listSolutionTaxonomies(),
        ]);

        setItems(solutionResponse.items);
        setTaxonomies(taxonomyResponse);
        setError(null);
      } catch {
        setError("The public solution repository could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadRepository();
  }, []);

  return (
    <SolutionRepositoryExplorer
      error={error}
      isLoading={isLoading}
      items={items}
      taxonomies={taxonomies}
    />
  );
}

export function SolutionRepositoryExplorer({
  error,
  isLoading = false,
  items,
  taxonomies,
}: {
  error?: string | null;
  isLoading?: boolean;
  items: SolutionRepositoryItem[];
  taxonomies: SolutionRepositoryTaxonomy[];
}) {
  const [selectedHazardIds, setSelectedHazardIds] = useState<string[]>([]);
  const [selectedHealthImplicationIds, setSelectedHealthImplicationIds] = useState<
    string[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<SolutionRepositoryItem | null>(null);
  const hazardOptions = useMemo(
    () =>
      taxonomies
        .filter((taxonomy) => taxonomy.type === "hazard")
        .map((taxonomy) => ({
          id: taxonomy.id,
          label: taxonomy.label,
        })),
    [taxonomies],
  );
  const healthImplicationOptions = useMemo(
    () => resolveHealthImplicationOptions(taxonomies),
    [taxonomies],
  );
  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesSelectedTaxonomies(item, "hazard", selectedHazardIds) &&
          matchesHealthImplications(item, selectedHealthImplicationIds) &&
          matchesSearch(item, searchQuery),
      ),
    [items, searchQuery, selectedHazardIds, selectedHealthImplicationIds],
  );
  const activeFilterCount =
    selectedHazardIds.length +
    selectedHealthImplicationIds.length +
    (searchQuery.trim() ? 1 : 0);

  function resetFilters() {
    setSelectedHazardIds([]);
    setSelectedHealthImplicationIds([]);
    setSearchQuery("");
    setOpenFilterId(null);
  }

  const emptyStateTitle = isLoading
    ? "Loading solution repository"
    : items.length === 0
      ? "No public solutions have been prepared yet"
      : "No public solutions match these filters";
  const emptyStateCopy = isLoading
    ? "CHART is loading the latest public solutions."
    : items.length === 0
      ? "Complete CHART onboarding to prepare the initial solution repository."
      : "Try changing the search, hazard, or health implication filters.";

  return (
    <div className="public-repository-shell">
      <main className="public-repository-main">
        <div className="repository-page-head">
          <span>CHART version 1</span>
          <span aria-hidden="true">›</span>
          <h1>Solution repository</h1>
        </div>

        <div className="repository-toolbar" aria-label="Solution repository filters">
          <label className="repository-search-field">
            <input
              placeholder="Search solutions"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <RepositoryMultiSelect
            id="hazard"
            isOpen={openFilterId === "hazard"}
            label="Climate hazard"
            options={hazardOptions}
            selectedIds={selectedHazardIds}
            onChange={setSelectedHazardIds}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "hazard" : null)}
          />
          <RepositoryMultiSelect
            id="health-implications"
            isOpen={openFilterId === "health-implications"}
            label="Health implications"
            options={healthImplicationOptions}
            selectedIds={selectedHealthImplicationIds}
            onChange={setSelectedHealthImplicationIds}
            onOpenChange={(isOpen) =>
              setOpenFilterId(isOpen ? "health-implications" : null)
            }
          />
          <button
            className="repository-reset-button"
            disabled={activeFilterCount === 0}
            type="button"
            onClick={resetFilters}
          >
            Reset
          </button>
          <span className="filter-result-count">
            {filteredItems.length} of {items.length} solutions
          </span>
        </div>

        {error ? (
          <section className="repository-empty-state">
            <h2>Repository unavailable</h2>
            <p>{error}</p>
          </section>
        ) : (
          <>
            <SolutionRepositoryGrid
              items={filteredItems}
              onOpenDetail={setDetailItem}
            />
            {filteredItems.length === 0 ? (
              <section className="repository-empty-state">
                <h2>{emptyStateTitle}</h2>
                <p>{emptyStateCopy}</p>
              </section>
            ) : null}
          </>
        )}
      </main>

      {detailItem ? (
        <SolutionRepositoryDetailDrawer
          item={detailItem}
          onClose={() => setDetailItem(null)}
        />
      ) : null}
    </div>
  );
}

function RepositoryMultiSelect({
  id,
  isOpen,
  label,
  options,
  selectedIds,
  onChange,
  onOpenChange,
}: {
  id: string;
  isOpen: boolean;
  label: string;
  options: RepositoryFilterOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [optionQuery, setOptionQuery] = useState("");
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id));
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(optionQuery.trim().toLowerCase()),
  );
  const selectedSummary =
    selectedOptions.length === 1
      ? selectedOptions[0]?.label
      : `${selectedOptions.length} selected`;

  function toggleOption(optionId: string) {
    onChange(
      selectedIds.includes(optionId)
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId],
    );
  }

  return (
    <details
      className="repository-multi-select"
      open={isOpen}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary>
        <span id={`repository-filter-${id}`}>{label}</span>
        {selectedOptions.length > 0 ? <strong>{selectedSummary}</strong> : null}
      </summary>
      <div
        className="repository-multi-select-menu"
        aria-labelledby={`repository-filter-${id}`}
      >
        <label className="repository-option-search">
          <span>Find a record</span>
          <input
            type="search"
            value={optionQuery}
            onChange={(event) => setOptionQuery(event.target.value)}
          />
        </label>
        <div className="repository-option-list">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const isSelected = selectedIds.includes(option.id);

              return (
                <label
                  className={`repository-option-row ${isSelected ? "selected" : ""}`}
                  key={option.id}
                >
                  <input
                    checked={isSelected}
                    type="checkbox"
                    onChange={() => toggleOption(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })
          ) : (
            <p className="repository-option-empty">No matching options.</p>
          )}
        </div>
        <div className="repository-multi-select-foot">
          <span>{label} is</span>
          <button
            disabled={selectedIds.length === 0}
            type="button"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      </div>
    </details>
  );
}

function resolveHealthImplicationOptions(
  taxonomies: SolutionRepositoryTaxonomy[],
): RepositoryFilterOption[] {
  return taxonomies
    .filter((taxonomy) => healthImplicationTaxonomyTypes.has(taxonomy.type))
    .map((taxonomy) => ({
      id: taxonomy.id,
      label: taxonomy.label,
    }))
    .sort(compareFilterOptions);
}

function matchesSelectedTaxonomies(
  item: SolutionRepositoryItem,
  type: string,
  selectedIds: string[],
) {
  return (
    selectedIds.length === 0 ||
    item.taxonomies.some(
      (taxonomy) => taxonomy.type === type && selectedIds.includes(taxonomy.id),
    )
  );
}

function matchesHealthImplications(
  item: SolutionRepositoryItem,
  selectedIds: string[],
) {
  if (selectedIds.length === 0) {
    return true;
  }

  return item.taxonomies.some(
    (taxonomy) =>
      healthImplicationTaxonomyTypes.has(taxonomy.type) &&
      selectedIds.includes(taxonomy.id),
  );
}

function matchesSearch(item: SolutionRepositoryItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return normalizedQuery
    .split(/\s+/)
    .every((token) => itemSearchText(item).includes(token));
}

function itemSearchText(item: SolutionRepositoryItem) {
  return [
    item.name,
    item.summary,
    item.description,
    item.implementationNotes,
    item.costOfImplementation,
    item.maintenanceRequirement,
    item.timeToImplement,
    item.evidenceLevel,
    ...item.taxonomies.map((taxonomy) => taxonomy.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareFilterOptions(
  first: RepositoryFilterOption,
  second: RepositoryFilterOption,
) {
  return first.label.localeCompare(second.label);
}
