<#-- Keycloak's information pages, in CHART's words. In CHART they mostly
     carry an invitation: "Accept your CHART invitation", then "Invitation
     accepted" with a way to sign in. Based on keycloak.v2. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if messageHeader??>${kcSanitize(msg("${messageHeader}"))?no_esc}<#else>${message.summary}</#if>
    <#elseif section = "form">
        <div id="kc-info-message">
            <p class="chart-lede"><#if requiredActions?? && actionUri?has_content>${msg("chartInviteLede")}<#else>${message.summary}</#if></p>
            <#if !skipLink??>
                <#if pageRedirectUri?has_content>
                    <a id="kc-info-continue" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" href="${pageRedirectUri}">${msg("backToApplication")}</a>
                <#elseif actionUri?has_content>
                    <a id="kc-info-continue" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" href="${actionUri}">${msg("proceedWithAction")}</a>
                <#elseif (client.baseUrl)?has_content>
                    <a id="kc-info-continue" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" href="${client.baseUrl}">${msg("backToApplication")}</a>
                </#if>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
