


export function createPageUrl(pageName: string) {
    // Preserve the original casing of the page name so that the generated URL
    // matches the defined react-router routes. Converting everything to
    // lowercase (as was done previously) caused links like `/dashboard` to be
    // generated, while the application only registers `/Dashboard`, leading to
    // navigation failures.
    return "/" + pageName.trim().replace(/\s+/g, "");
}
