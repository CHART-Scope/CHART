<#-- CHART email layout: inline styles, since mail clients drop stylesheets. -->
<#macro emailLayout>
<html lang="${locale.language}" dir="${(ltr)?then('ltr','rtl')}">
<body style="margin:0;padding:0;background:#f7f5f3;font-family:'Noto Sans Display',Arial,sans-serif;color:#2b2d31;font-size:15px;line-height:1.6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f3">
    <tr><td style="background:#2b2d31;padding:16px 24px;color:#bef274;font-family:'Fira Sans',Arial,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.08em">CHART</td></tr>
    <tr><td style="padding:24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d4d2ce;border-radius:12px">
        <tr><td style="padding:24px 28px">
          <#nested>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
</#macro>
