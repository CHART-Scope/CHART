export function buildApiDocsHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CHART API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      :root {
        --chart-green: #2e9449;
        --chart-green-dark: #16431f;
      }

      body {
        margin: 0;
        background: #f7fbf7;
      }

      .swagger-ui .topbar {
        background: var(--chart-green-dark);
      }

      .swagger-ui .topbar .download-url-wrapper .select-label select {
        border-color: var(--chart-green);
      }

      .swagger-ui .info .title,
      .swagger-ui .opblock-tag {
        color: var(--chart-green-dark);
      }

      .swagger-ui .btn.authorize {
        border-color: var(--chart-green);
        color: var(--chart-green);
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      const currentPath = window.location.pathname.replace(/\\/$/, "");
      const openApiUrl = currentPath && currentPath !== "/api"
        ? currentPath + "/openapi.json"
        : "/openapi.json";

      window.ui = SwaggerUIBundle({
        dom_id: "#swagger-ui",
        url: openApiUrl,
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      });
    </script>
  </body>
</html>`;
}
