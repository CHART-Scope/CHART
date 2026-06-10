"use client";

import { useEffect, useMemo, useState } from "react";

import { listGeographies, type GeographyRecord } from "../../lib/geographyClient";

function isInUserScope(geography: GeographyRecord, scopes: string[]) {
  if (scopes.length === 0) {
    return true;
  }

  return scopes.some((scope) => {
    return (
      geography.path === scope ||
      geography.path.startsWith(`${scope}/`) ||
      scope.startsWith(`${geography.path}/`)
    );
  });
}

function sortGeographies(geographies: GeographyRecord[]) {
  return [...geographies].sort((first, second) => {
    if (first.countryCode !== second.countryCode) {
      return first.countryCode.localeCompare(second.countryCode);
    }

    if (first.level !== second.level) {
      return first.level.localeCompare(second.level);
    }

    return first.name.localeCompare(second.name);
  });
}

function getInitialSelectedGeography(
  geographies: GeographyRecord[],
  activeGeography: string | undefined,
) {
  return (
    geographies.find((geography) => geography.path === activeGeography) ??
    geographies.find((geography) => geography.id === activeGeography) ??
    geographies[0]
  );
}

type UseDashboardGeographiesOptions = {
  geographyScopes: string[];
  activeGeography: string | undefined;
};

export function useDashboardGeographies({
  geographyScopes,
  activeGeography,
}: UseDashboardGeographiesOptions) {
  const [geographies, setGeographies] = useState<GeographyRecord[]>([]);
  const [selectedGeographyId, setSelectedGeographyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const visibleGeographies = useMemo(
    () =>
      sortGeographies(
        geographies.filter((geography) => isInUserScope(geography, geographyScopes)),
      ),
    [geographyScopes, geographies],
  );

  const selectedGeography = visibleGeographies.find(
    (geography) => geography.id === selectedGeographyId,
  );

  useEffect(() => {
    let isMounted = true;

    async function loadGeographies() {
      try {
        const records = await listGeographies();

        if (!isMounted) {
          return;
        }

        setGeographies(records);
        setError(null);

        const firstSelected = getInitialSelectedGeography(records, activeGeography);
        setSelectedGeographyId(firstSelected?.id ?? "");
      } catch {
        if (isMounted) {
          setError("CHART geography records could not be loaded.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadGeographies();

    return () => {
      isMounted = false;
    };
  }, [activeGeography]);

  useEffect(() => {
    if (visibleGeographies.length === 0) {
      setSelectedGeographyId("");
      return;
    }

    if (
      selectedGeographyId &&
      visibleGeographies.some((geography) => geography.id === selectedGeographyId)
    ) {
      return;
    }

    const firstSelected = getInitialSelectedGeography(
      visibleGeographies,
      activeGeography,
    );
    setSelectedGeographyId(firstSelected?.id ?? "");
  }, [activeGeography, selectedGeographyId, visibleGeographies]);

  return {
    visibleGeographies,
    selectedGeography,
    isLoading,
    error,
    setSelectedGeographyId,
  };
}
