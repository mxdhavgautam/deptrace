"use client";

import { debounce } from "lodash";

export function SearchBox() {
  return <input onChange={debounce(() => undefined, 250)} />;
}
