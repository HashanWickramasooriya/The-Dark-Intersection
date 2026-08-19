// Type-only re-export: erased at build time, so no server code ships to the
// client. Keeps the wire protocol defined in exactly one place.
export type * from "../../../server/protocol";
