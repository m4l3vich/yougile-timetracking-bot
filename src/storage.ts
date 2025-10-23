import { JSONFilePreset } from 'lowdb/node'

export interface YougileSession {
  key: string
  userId: string
}

export interface YougileTask {
  uuid: string
  numericId: number
  title: string
}

export interface YougileUser {
  uuid: string
  name: string
}

export interface StorageData {
  session?: YougileSession
  revision: number
  tasksCache: YougileTask[]
  usersCache: YougileUser[]
}

const defaultData: StorageData = { tasksCache: [], usersCache: [], revision: 0 }
export const db = await JSONFilePreset<StorageData>('db.json', defaultData)
