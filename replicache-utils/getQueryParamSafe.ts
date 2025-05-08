export function getQueryParamSafe(param: string) {
    try {
        const url = new URL(window.location.href);
        return url.searchParams.get(param);
    } catch (e) {
        return null;
    }
}
