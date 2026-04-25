import get from "lodash/get";

export function readName(value: unknown) {
  return get(value, "profile.name");
}
