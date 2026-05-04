// Brain region and atlas types

export interface Region {
  id: number
  name: string
  abbreviation: string
  level1: string
  level2: string
  level3: string
  level4: string
  value: number
  parent_id: number | null
  children: Region[]
  color?: string
  visible?: boolean
  selected?: boolean
}
