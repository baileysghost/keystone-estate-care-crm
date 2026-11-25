import core from "eslint-config-next/core-web-vitals";
export default [
  ...core,
  { ignores: [".next/**", "node_modules/**", ".demo/**"] },
  { rules: { "react-hooks/set-state-in-effect": "off" } },
];
