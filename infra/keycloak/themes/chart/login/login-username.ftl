<#-- CHART sign-in, step 1: the email address. Keycloak then emails a code
     (login-email-otp.ftl, docs/sign-in.md). Based on keycloak.v2. -->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<#import "social-providers.ftl" as identityProviders>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username') displayInfo=(client?? && client.baseUrl?has_content); section>
    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <p class="chart-lede">${msg("chartEmailCodeLede")}</p>
        <div id="kc-form">
            <div id="kc-form-wrapper">
                <form id="kc-form-login" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                    <@field.group name="username" label=msg("chartEmailLabel") error=messagesPerField.get("username")>
                        <span class="${properties.kcInputClass} <#if messagesPerField.existsError('username')>${properties.kcError}</#if>">
                            <input id="username" name="username" value="${login.username!''}" type="text" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" autofocus aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"/>
                        </span>
                    </@field.group>
                    <@buttons.loginButton />
                </form>
            </div>
        </div>
    <#elseif section = "info">
        <a class="chart-back" href="${client.baseUrl}">${msg("chartBackToChart")}</a>
    <#elseif section = "socialProviders">
        <#if social.providers?? && social.providers?has_content>
            <@identityProviders.show social=social />
        </#if>
    </#if>
</@layout.registrationLayout>
