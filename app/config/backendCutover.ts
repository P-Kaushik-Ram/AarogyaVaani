export type BackendCutoverPlan = Readonly<{id:string;from:string;to:string}>;
// Activation requires an independently reviewed exact-origin plan in an approved
// future build. No wildcard, runtime URL input or EXPO_PUBLIC variable can enable it.
export const approvedBackendCutover: BackendCutoverPlan | null = null;
