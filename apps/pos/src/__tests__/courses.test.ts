import { describe, it, expect } from "vitest"
import { coursesToHold, sanitizeHeldCourses, nextCourseToFire } from "@takeasygo/business/browser"
import { groupByCourse, nextCourse } from "../components/shared/Courses"

// Piloto 06/11: tiempos de cocina.
describe("qué espera la marcha", () => {
  it("entrada + principal ⇒ espera el principal", () => {
    expect(coursesToHold([{ course: "entrada" }, { course: "principal" }, {}])).toEqual(["principal"])
  })
  it("principal + postre ⇒ espera el postre", () => {
    expect(coursesToHold([{ course: "postre" }, { course: "principal" }])).toEqual(["postre"])
  })
  it("un solo tiempo o sin tiempos ⇒ nada espera", () => {
    expect(coursesToHold([{ course: "principal" }, {}])).toEqual([])
    expect(coursesToHold([{}, {}])).toEqual([])
  })
  it("la lista del POS solo acepta tiempos presentes", () => {
    const items = [{ course: "entrada" as const }, { course: "principal" as const }]
    expect(sanitizeHeldCourses(["principal"], items)).toEqual(["principal"])
    expect(sanitizeHeldCourses(["postre"], items)).toBeNull()
    expect(sanitizeHeldCourses("principal", items)).toBeNull()
    expect(sanitizeHeldCourses(undefined, items)).toEqual([])
  })
  it("marcha en orden de salida", () => {
    expect(nextCourseToFire(["postre", "principal"])).toBe("principal")
    expect(nextCourseToFire([])).toBeNull()
  })
})

describe("carrito por tiempos", () => {
  it("un toque pasa al tiempo siguiente", () => {
    expect(nextCourse(undefined)).toBe("entrada")
    expect(nextCourse("entrada")).toBe("principal")
    expect(nextCourse("postre")).toBeUndefined()
  })
  it("agrupa en orden de salida y conserva el índice original", () => {
    const groups = groupByCourse([{ course: "principal", n: 0 }, { n: 1 }, { course: "entrada", n: 2 }] as never[])
    expect(groups.map((g) => g.course)).toEqual(["entrada", "principal", null])
    expect(groups[0].entries[0].idx).toBe(2)
  })
})
