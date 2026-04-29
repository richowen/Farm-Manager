// The map page is a fully interactive client-side app — SSR is not useful
// and causes Leaflet to crash on the server ("window is not defined").
export const ssr = false;
export const prerender = false;
