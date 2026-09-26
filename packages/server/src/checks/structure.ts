import {
  parseSync,
  ArrowFunctionExpression,
  Node,
  Statement,
  TSSignature,
  TSType,
} from "oxc-parser"

export type StructureViolation = Readonly<{
  rule: "usecase-factory" | "ports-atomic" | "no-let"
  file: string
  message: string
}>

const usecaseFactoryMessage = "backend skill: use case files export a curried make<Action> factory"

const portsAtomicMessage = (name: string, count: number): string =>
  `backend skill: ports are atomic function types; ${name} bundles ${count} functions`

export const noLetMessage =
  "bindings are const; rework the reassignment or comment the line with `structure: allow-let`"

const isArrowFunction = (node: Node | null): node is ArrowFunctionExpression =>
  node !== null && node.type === "ArrowFunctionExpression"

const arrowReturnsFunction = (factory: ArrowFunctionExpression): boolean => {
  const body = factory.body
  if (isArrowFunction(body)) return true
  if (body.type !== "BlockStatement") return false
  return body.body.some(
    (statement) => statement.type === "ReturnStatement" && isArrowFunction(statement.argument),
  )
}

const makeFactoryInit = (statement: Statement): Node | null => {
  if (statement.type !== "ExportNamedDeclaration") return null
  const declaration = statement.declaration
  if (declaration === null || declaration.type !== "VariableDeclaration") return null
  for (const declarator of declaration.declarations) {
    const id = declarator.id
    if (id.type !== "Identifier") continue
    if (!/^make[A-Z]/.test(id.name)) continue
    return declarator.init
  }
  return null
}

const checkUsecaseFile = (fileName: string, source: string): readonly StructureViolation[] => {
  const factories = parseSync(fileName, source)
    .program.body.map(makeFactoryInit)
    .filter((init) => init !== null)
  const compliant =
    factories.length > 0 &&
    factories.every((init) => isArrowFunction(init) && arrowReturnsFunction(init))
  return compliant
    ? []
    : [{ rule: "usecase-factory", file: fileName, message: usecaseFactoryMessage }]
}

const objectTypeMembers = (annotation: TSType): readonly TSSignature[] | null => {
  if (annotation.type === "TSTypeLiteral") return annotation.members
  if (annotation.type === "TSTypeReference") {
    const argument = annotation.typeArguments?.params[0]
    if (argument !== undefined && argument.type === "TSTypeLiteral") return argument.members
  }
  return null
}

const isFunctionMember = (member: TSSignature): boolean =>
  member.type === "TSMethodSignature" ||
  (member.type === "TSPropertySignature" &&
    member.typeAnnotation?.typeAnnotation.type === "TSFunctionType")

const checkPortsFile = (fileName: string, source: string): readonly StructureViolation[] => {
  const violations: StructureViolation[] = []
  for (const statement of parseSync(fileName, source).program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue
    const declaration = statement.declaration
    if (declaration === null || declaration.type !== "TSTypeAliasDeclaration") continue
    const members = objectTypeMembers(declaration.typeAnnotation)
    if (members === null) continue
    const functionMembers = members.filter(isFunctionMember).length
    if (functionMembers < 2) continue
    violations.push({
      rule: "ports-atomic",
      file: fileName,
      message: portsAtomicMessage(declaration.id.name, functionMembers),
    })
  }
  return violations
}

/** The line marker that excuses one let binding, on the declaration's own line. */
const allowLetMarker = "structure: allow-let"

/** Every node in the parsed program, depth first. */
const walkNodes = (node: unknown, visit: (node: Node) => void): void => {
  if (node === null || typeof node !== "object") return
  const record = node as Record<string, unknown>
  if (typeof record.type === "string") visit(node as Node)
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const child of value) walkNodes(child, visit)
    } else {
      walkNodes(value, visit)
    }
  }
}

const lineOf = (source: string, offset: number | undefined): number => {
  if (offset === undefined) return 1
  return source.slice(0, offset).split("\n").length
}

/**
 * The whole file may not declare a mutable binding. Reassignment hides state
 * in a second place, and const forces the mutation to live where it reads.
 * A declaration with `structure: allow-let` on its own line is the one
 * accepted exception, for the rare hot loop that reads better with it.
 */
export const checkNoLet = (fileName: string, source: string): readonly StructureViolation[] => {
  const lines = source.split("\n")
  const violations: StructureViolation[] = []
  walkNodes(parseSync(fileName, source).program, (node) => {
    if (node.type !== "VariableDeclaration" || node.kind !== "let") return
    const line = lineOf(source, node.start)
    if ((lines[line - 1] ?? "").includes(allowLetMarker)) return
    violations.push({ rule: "no-let", file: fileName, message: `${noLetMessage} (line ${line})` })
  })
  return violations
}

export const checkStructure = (fileName: string, source: string): readonly StructureViolation[] => {
  if (fileName.endsWith(".usecase.ts")) return checkUsecaseFile(fileName, source)
  if (fileName.endsWith(".ports.ts")) return checkPortsFile(fileName, source)
  return []
}
