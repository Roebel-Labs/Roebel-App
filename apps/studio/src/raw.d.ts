// Vite `?raw` imports (the help guide is bundled as text).
declare module '*?raw' {
  const text: string;
  export default text;
}

// Vite asset imports (resolve to a URL).
declare module '*.svg' {
  const url: string;
  export default url;
}
declare module '*.png' {
  const url: string;
  export default url;
}
