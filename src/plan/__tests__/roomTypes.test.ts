// Room types: a room's type is what the estimate, the sun and BASIX read; a room with none (one
// drawn before there were types) goes by its name exactly as it did. Picking a type names a room
// nobody has named.

import { describe, expect, it } from 'vitest'
import { isBasixLiving } from '../../basix/basix'
import { isLiving } from '../../sun/rooms'
import { garageSlab } from '../driveway'
import { addRoom } from '../ops'
import { designQuantities } from '../quantities'
import { isRoomType, ROOM_TYPES, roomCountsAs, roomIsGarage, roomTypeInfo, roomWet, setRoomType, suggestedRoomName } from '../roomTypes'
import { garageFloor } from './fixtures'

describe('a room’s type', () => {
  it('says which wet room the estimate prices, whatever the room is called', () => {
    expect(roomWet({ name: 'Ens', type: 'ensuite' })).toBe('bathroom')
    expect(roomWet({ name: 'Bthrm', type: 'bathroom' })).toBe('bathroom')
    expect(roomWet({ name: 'The hub', type: 'open' })).toBe('kitchen')
    expect(roomWet({ name: 'Mud room', type: 'laundry' })).toBe('laundry')
    expect(roomWet({ name: 'Powder', type: 'toilet' })).toBe('toilet')
    // The type wins over a name that reads otherwise.
    expect(roomWet({ name: 'Old bathroom', type: 'study' })).toBeNull()
  })

  it('tells a garage from a room with a floor finish', () => {
    expect(roomIsGarage({ name: 'Parking', type: 'garage' })).toBe(true)
    expect(roomIsGarage({ name: 'Garage conversion', type: 'bedroom' })).toBe(false)
  })

  it('counts living areas for the sun and for BASIX, which reads a kitchen too', () => {
    expect(isLiving({ name: 'The hub', type: 'open' })).toBe(true)
    expect(isLiving({ name: 'Snug', type: 'living' })).toBe(true)
    expect(isLiving({ name: 'Galley', type: 'kitchen' })).toBe(false)
    expect(isLiving({ name: 'Family bathroom', type: 'bathroom' })).toBe(false)
    expect(isBasixLiving({ name: 'Galley', type: 'kitchen' })).toBe(true)
    expect(isBasixLiving({ name: 'Living', type: 'bedroom' })).toBe(false)
    // The tick still has the last word for the sun.
    expect(isLiving({ name: 'Study', type: 'study', living: true })).toBe(true)
    expect(isLiving({ name: 'Snug', type: 'living', living: false })).toBe(false)
  })

  it('is only one this version knows: anything else goes by the name', () => {
    expect(isRoomType('bathroom')).toBe(true)
    expect(isRoomType('wine cellar')).toBe(false)
    expect(roomTypeInfo({ type: 'wine cellar' as never })).toBeNull()
    expect(roomWet({ name: 'Bathroom', type: 'wine cellar' as never })).toBe('bathroom')
  })
})

describe('a room with no type (drawn before there were types)', () => {
  it('goes by its name for the estimate, the garage, the sun and BASIX, as it always did', () => {
    expect(roomWet({ name: 'Main bathroom' })).toBe('bathroom')
    expect(roomWet({ name: 'Living kitchen' })).toBe('kitchen')
    expect(roomWet({ name: 'Bed 2' })).toBeNull()
    expect(roomIsGarage({ name: 'Double garage' })).toBe(true)
    expect(roomIsGarage({ name: 'Rumpus' })).toBe(false)
    expect(isLiving({ name: 'Family room' })).toBe(true)
    expect(isLiving({ name: 'Kitchen' })).toBe(false)
    expect(isBasixLiving({ name: 'Kitchen' })).toBe(true)
  })

  it('leaves an older plan’s quantities as they were', () => {
    const plan = garageFloor()
    const q = designQuantities(plan, null, [])
    expect(q.wet.laundry).toMatchObject({ count: 1, ids: ['r3'], names: ['Laundry'] })
    expect(q.finishes.ids).toEqual(['r2', 'r3', 'r4'])
    expect(garageSlab(plan).name).toBe('Garage slab')
  })
})

describe('the takeoff, with types', () => {
  it('prices a room as its type and not its name', () => {
    const plan = garageFloor()
    const typed = {
      ...plan,
      rooms: plan.rooms.map(r => (r.id === 'r1' ? { ...r, name: 'Parking', type: 'garage' as const } : r.id === 'r3' ? { ...r, name: 'Utility', type: 'bathroom' as const } : r.id === 'r4' ? { ...r, name: 'Laundry nook', type: 'study' as const } : r)),
    }
    const q = designQuantities(typed, null, [])
    expect(q.wet.bathroom).toMatchObject({ count: 1, ids: ['r3'], names: ['Utility'] })
    expect(q.wet.laundry.count).toBe(0)
    // The garage, by type, still has no floor finish.
    expect(q.finishes.ids).toEqual(['r2', 'r3', 'r4'])
    expect(garageSlab(typed).name).toBe('Parking slab')
  })
})

describe('picking a type', () => {
  const base = () => addRoom(addRoom(garageFloor(), 'level_ground', [1, 1], 'Room 5'), 'level_ground', [2, 2], 'Room 6')
  const last = (p: ReturnType<typeof base>) => p.rooms.at(-1)!

  it('names a room nobody has named, numbering from 2 where the name is taken', () => {
    const p = base()
    const [a, b] = p.rooms.slice(-2)
    const one = setRoomType(p, a.id, 'bedroom')
    expect(one.rooms.find(r => r.id === a.id)).toMatchObject({ name: 'Bedroom', type: 'bedroom' })
    const two = setRoomType(one, b.id, 'bedroom')
    expect(last(two)).toMatchObject({ name: 'Bedroom 2', type: 'bedroom' })
    expect(suggestedRoomName(two, 'bedroom')).toBe('Bedroom 3')
    // The plan has a Laundry already.
    expect(suggestedRoomName(two, 'laundry')).toBe('Laundry 2')
  })

  it('renames again while the name is still the one a type gave, and keeps a name someone typed', () => {
    const p = base()
    const id = last(p).id
    const bed = setRoomType(p, id, 'bedroom')
    expect(last(setRoomType(bed, id, 'dining')).name).toBe('Dining')
    const named = { ...bed, rooms: bed.rooms.map(r => (r.id === id ? { ...r, name: 'Guest room' } : r)) }
    expect(last(setRoomType(named, id, 'study'))).toMatchObject({ name: 'Guest room', type: 'study' })
    // An older room called Entry keeps its name when it gets a type.
    expect(setRoomType(p, 'r2', 'hall').rooms.find(r => r.id === 'r2')).toMatchObject({ name: 'Entry', type: 'hall' })
  })

  it('hands the winter sun tick back to the type', () => {
    const p = base()
    const id = last(p).id
    const ticked = { ...p, rooms: p.rooms.map(r => (r.id === id ? { ...r, living: true } : r)) }
    const bed = last(setRoomType(ticked, id, 'bedroom'))
    expect('living' in bed).toBe(false)
    expect(isLiving(bed)).toBe(false)
  })

  it('places a room with the Room tool’s type already on it', () => {
    const p = addRoom(garageFloor(), 'level_ground', [1, 1], suggestedRoomName(garageFloor(), 'bathroom'), 'bathroom')
    expect(last(p)).toMatchObject({ name: 'Bathroom', type: 'bathroom' })
    // No type on the tool: nothing is stored, and the room goes by its name.
    expect('type' in last(addRoom(garageFloor(), 'level_ground', [1, 1], 'Room 5'))).toBe(false)
  })

  it('says on the Room card what the type (or the name) makes it in the estimate', () => {
    expect(roomCountsAs({ name: 'Ens', type: 'ensuite' })).toBe('The estimate prices it as a bathroom, with its plumbing.')
    expect(roomCountsAs({ name: 'Bathroom' })).toBe('Going by its name, the estimate prices it as a bathroom, with its plumbing.')
    expect(roomCountsAs({ name: 'Garage' })).toMatch(/^Going by its name, a garage has no floor finish/)
    expect(roomCountsAs({ name: 'Bed 1' })).toMatch(/^No type yet: pick one/)
    expect(roomCountsAs({ name: 'Bed 1', type: 'bedroom' })).toMatch(/^The estimate prices its floor finish/)
  })

  it('offers each type once, with a name to start from', () => {
    expect(new Set(ROOM_TYPES.map(t => t.id)).size).toBe(ROOM_TYPES.length)
    expect(ROOM_TYPES.every(t => t.label && t.name)).toBe(true)
  })
})
