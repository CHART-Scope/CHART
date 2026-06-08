import type { Metadata } from "next";

import config from "@payload-config";
import { RootPage } from "@payloadcms/next/views";

import { importMap } from "../importMap";

type PageParams = {
  segments?: string[];
};

type SearchParams = Record<string, string | string[]>;

type PageProps = {
  params?: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
};

type PayloadRootParams = {
  segments: string[];
};

export const metadata: Metadata = {
  title: "A Halal Chinese Restaurant on Caledonian Road",
  description: "CHART solution repository administration",
};

function resolveParams(params?: Promise<PageParams>) {
  return Promise.resolve<PageParams>(params ?? {}).then((resolvedParams) => {
    return resolvedParams as PayloadRootParams;
  });
}

function resolveSearchParams(searchParams?: Promise<SearchParams>) {
  return Promise.resolve<SearchParams>(searchParams ?? {}).then(
    (resolvedSearchParams) => {
      return Object.fromEntries(
        Object.entries(resolvedSearchParams).filter(([, value]) => {
          return value !== undefined;
        }),
      ) as SearchParams;
    },
  );
}

const Page = ({ params, searchParams }: PageProps) =>
  RootPage({
    config,
    importMap,
    params: resolveParams(params),
    searchParams: resolveSearchParams(searchParams),
  });

export default Page;
