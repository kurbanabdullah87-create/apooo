import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 2 * 60 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });
  queryClient.setQueryDefaults(["customers"], { staleTime: 5 * 60_000 });
  queryClient.setQueryDefaults(["work", "job"], { staleTime: 30_000 });
  queryClient.setQueryDefaults(["work", "equipment"], { staleTime: 2 * 60_000 });
  queryClient.setQueryDefaults(["work", "settings"], { staleTime: 60 * 60_000 });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
