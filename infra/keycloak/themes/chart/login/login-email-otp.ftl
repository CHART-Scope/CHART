<#-- CHART sign-in, step 2: the code Keycloak emailed. Overrides the
     email-otp-form provider's template (infra/keycloak/providers); the field
     and button names are the provider's. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('email-otp'); section>
    <#if section = "header">
        ${msg("chartCheckEmailTitle")}
    <#elseif section = "form">
        <p class="chart-lede">
            <#if maskedEmail?has_content>${msg("chartCodeSentTo", maskedEmail)}<#else>${msg("chartCodeSent")}</#if>
        </p>
        <form id="kc-otp-login-form" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcFormGroupLabelClass!}">
                    <label for="email-otp" class="${properties.kcFormLabelClass!}">
                        <span class="${properties.kcFormLabelTextClass!}">${msg("loginEmailOtp")}</span>
                    </label>
                </div>
                <span class="${properties.kcInputClass!} chart-code <#if messagesPerField.existsError('email-otp')>${properties.kcError!}</#if>">
                    <input id="email-otp" name="email-otp" type="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="6" autofocus dir="ltr" aria-invalid="<#if messagesPerField.existsError('email-otp')>true</#if>"<#if messagesPerField.existsError('email-otp')> aria-describedby="input-error-email-otp-code"</#if>/>
                </span>
                <#if messagesPerField.existsError('email-otp')>
                    <span id="input-error-email-otp-code" class="chart-field-error" aria-live="polite">${kcSanitize(messagesPerField.get('email-otp'))?no_esc}</span>
                </#if>
            </div>
            <div class="${properties.kcFormGroupClass!}">
                <button class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" name="login" id="kc-login" type="submit">${msg("doLogIn")}</button>
            </div>
            <div class="chart-code-actions">
                <button class="chart-link-button" name="resend-email" id="kc-resend-email" type="submit">${msg("doResendEmail")}</button>
                <a class="chart-link-button" href="${url.loginRestartFlowUrl}">${msg("chartUseAnotherEmail")}</a>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
