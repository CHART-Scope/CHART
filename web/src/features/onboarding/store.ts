import { createPersistedStore } from "@/lib/store/createPersistedStore";

export type OnboardingState = {
  country: string | null;
  level: string | null;
  geo: string | null;
  subgeo: string | null;
  primarySectorId: string | null;
  collaboratingSectorIds: string[];
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  currentStep: number;
};

type Actions = {
  setCountry: (country: string) => void;
  setLevel: (level: string) => void;
  setGeo: (geo: string) => void;
  setSubgeo: (subgeo: string) => void;
  selectPrimarySector: (id: string) => void;
  toggleCollaboratingSector: (id: string) => void;
  setAdminField: (
    field: "adminName" | "adminEmail" | "adminPassword",
    value: string,
  ) => void;
  setStep: (step: number) => void;
  hydrate: (state: Partial<OnboardingState>) => void;
  reset: () => void;
};

const emptyState: OnboardingState = {
  country: null,
  level: null,
  geo: null,
  subgeo: null,
  primarySectorId: null,
  collaboratingSectorIds: [],
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  currentStep: 0,
};

type Persisted = Omit<OnboardingState, "adminPassword">;

export const useOnboardingStore = createPersistedStore<
  OnboardingState & Actions,
  Persisted
>(
  (set) => ({
    ...emptyState,
    setCountry: (country) =>
      set({ country: country || null, level: null, geo: null, subgeo: null }),
    setLevel: (level) => set({ level: level || null, geo: null, subgeo: null }),
    setGeo: (geo) => set({ geo: geo || null, subgeo: null }),
    setSubgeo: (subgeo) => set({ subgeo: subgeo || null }),
    selectPrimarySector: (id) =>
      set((s) => ({
        primarySectorId: id,
        collaboratingSectorIds: s.collaboratingSectorIds.filter((x) => x !== id),
      })),
    toggleCollaboratingSector: (id) =>
      set((s) => ({
        collaboratingSectorIds: s.collaboratingSectorIds.includes(id)
          ? s.collaboratingSectorIds.filter((x) => x !== id)
          : [...s.collaboratingSectorIds, id],
      })),
    setAdminField: (field, value) =>
      set({ [field]: value } as Pick<OnboardingState, typeof field>),
    setStep: (step) => set({ currentStep: Math.max(0, step) }),
    hydrate: (state) => set(state),
    reset: () => set(emptyState),
  }),
  {
    name: "chart:onboarding",
    version: 1,
    partialize: (state) => ({
      country: state.country,
      level: state.level,
      geo: state.geo,
      subgeo: state.subgeo,
      primarySectorId: state.primarySectorId,
      collaboratingSectorIds: state.collaboratingSectorIds,
      adminName: state.adminName,
      adminEmail: state.adminEmail,
      currentStep: state.currentStep,
    }),
  },
);
