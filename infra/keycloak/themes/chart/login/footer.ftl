<#-- CHART sign-in, the brand panel from the design (frame 04): what CHART
     is for, beside the form. keycloak.v2 renders this macro at the end of
     every login page; chart.css places it as the left column on wide
     screens and hides it on narrow ones. -->
<#macro content>
<aside class="chart-brand" aria-labelledby="chart-brand-title">
    <h2 id="chart-brand-title" class="chart-brand-title">${msg("chartBrandTitle")}</h2>
    <ol class="chart-brand-steps">
        <li><strong>${msg("chartBrandStep1")}</strong><span>${msg("chartBrandStep1Text")}</span></li>
        <li><strong>${msg("chartBrandStep2")}</strong><span>${msg("chartBrandStep2Text")}</span></li>
        <li><strong>${msg("chartBrandStep3")}</strong><span>${msg("chartBrandStep3Text")}</span></li>
    </ol>
    <p class="chart-brand-note">${msg("chartBrandNote")}</p>
</aside>
</#macro>
