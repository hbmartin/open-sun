import { z } from "zod"

/** A timezone-bearing instant; naive timestamps would be read as local time. */
export const OffsetDateTimeSchema = z.iso.datetime({ offset: true })
