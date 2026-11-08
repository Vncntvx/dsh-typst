/** CSS modules ship scoped class maps; the esbuild build inlines the styles. */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
