/**
 * Navigate to the sign-out route with a POST, as a form submission does, so
 * the server can clear the session cookies and redirect to Keycloak logout.
 */
export function submitSignOut(returnTo: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/auth/signout?returnTo=${encodeURIComponent(returnTo)}`;
  form.style.display = "none";
  document.body.appendChild(form);
  form.submit();
}
