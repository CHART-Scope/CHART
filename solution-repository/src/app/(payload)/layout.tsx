import type { ServerFunctionClient } from "payload";

import "@payloadcms/next/css";

import "./custom.scss";

type LayoutProps = {
  children?: React.ReactNode;
};

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";

  const { handleServerFunctions } = await import("@payloadcms/next/layouts");
  const config = await import("@payload-config");
  const { importMap } = await import("./admin/importMap");

  return handleServerFunctions({
    ...args,
    config: config.default,
    importMap,
  });
};

const Layout = async ({ children }: LayoutProps) => {
  const { RootLayout } = await import("@payloadcms/next/layouts");
  const config = await import("@payload-config");
  const { importMap } = await import("./admin/importMap");

  return (
    <RootLayout
      config={config.default}
      htmlProps={{ suppressHydrationWarning: true }}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  );
};

export default Layout;
