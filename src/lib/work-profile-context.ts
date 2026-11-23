import { createContext, useContext } from "react";
import type { BusinessProfile } from "@/lib/work-profiles";

export type ProfileContextValue = {
  profiles: BusinessProfile[];
  activeProfile: BusinessProfile | null;
  activeProfileId: string | null;
  loading: boolean;
  profileError: string | null;
  isUsta: boolean;
  switchProfile: (id: string) => boolean;
  refreshProfiles: () => Promise<void>;
};

const fallbackProfileContext: ProfileContextValue = {
  profiles: [], activeProfile: null, activeProfileId: null, loading: false, profileError: null, isUsta: false,
  switchProfile: () => false, refreshProfiles: async () => {},
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useBusinessProfile() {
  return useContext(ProfileContext) ?? fallbackProfileContext;
}
