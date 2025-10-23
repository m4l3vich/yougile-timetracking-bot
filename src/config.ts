const throwIfNot = function <T, K extends keyof T>(
  obj: Partial<T>,
  prop: K,
  msg?: string
): T[K] {
  if (obj[prop] === undefined || obj[prop] === null) {
    throw new Error(msg || `Environment is missing variable ${String(prop)}`)
  } else {
    return obj[prop] as T[K]
  }
}

;['TG_TOKEN', 'YG_COMPANY_ID'].forEach(v => throwIfNot(process.env, v))

export interface IProcessEnv {
  TG_TOKEN: string
  TG_WHITELIST?: string
  YG_COMPANY_ID: string
  YG_API_URL?: string
  YG_CREDENTIALS_FILE?: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface ProcessEnv extends IProcessEnv {}
  }
}
