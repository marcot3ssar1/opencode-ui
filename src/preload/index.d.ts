import type { OcApi } from './index'

declare global {
  interface Window {
    oc: OcApi
  }
}

export type { OcApi }
