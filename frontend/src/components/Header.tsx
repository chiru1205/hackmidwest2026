/* The real header now lives in components/shell/AppHeader and is rendered once by App.
   `Header` stays as a no-op so older screens that still render it do not double up. */
export { AppHeader } from "./shell/AppHeader";
export const Header = () => null;
