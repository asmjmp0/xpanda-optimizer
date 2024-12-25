import {
    assertConsistentIdentifiers,
    assertTerminalPredsExist,
    assertTerminalSuccessorsExist,
    assertValidBlockNesting,
    buildReactiveScopeTerminalsHIR,
    lower,
    mergeConsecutiveBlocks,
    mergeOverlappingReactiveScopesHIR,
    printFunction,
    pruneUnusedLabelsHIR,
  } from '../HIR';
  import {
    analyseFunctions,
    inferMutableRanges,
    inferReactivePlaces,
    inferReferenceEffects,
    inlineImmediatelyInvokedFunctionExpressions,
  } from '../Inference';
  import {
    constantPropagation,
    deadCodeElimination,
    pruneMaybeThrows,
  } from '../Optimization';
  import {
    CodegenFunction,
    alignObjectMethodScopes,
    assertScopeInstructionsWithinScopes,
    assertWellFormedBreakTargets,
    buildReactiveFunction,
    codegenFunction,
    extractScopeDeclarationsFromDestructuring,
    inferReactiveScopeVariables,
    memoizeFbtAndMacroOperandsInSameScope,
    mergeReactiveScopesThatInvalidateTogether,
    promoteUsedTemporaries,
    propagateEarlyReturns,
    pruneHoistedContexts,
    pruneNonEscapingScopes,
    pruneNonReactiveDependencies,
    pruneUnusedLValues,
    pruneUnusedLabels,
    pruneUnusedScopes,
    renameVariables,
  } from '../ReactiveScopes';
  import {findContextIdentifiers} from '../HIR/FindContextIdentifiers';
  import {alignMethodCallScopes} from '../ReactiveScopes/AlignMethodCallScopes';
  import {alignReactiveScopesToBlockScopesHIR} from '../ReactiveScopes/AlignReactiveScopesToBlockScopesHIR';
  import {flattenReactiveLoopsHIR} from '../ReactiveScopes/FlattenReactiveLoopsHIR';
  import {flattenScopesWithHooksOrUseHIR} from '../ReactiveScopes/FlattenScopesWithHooksOrUseHIR';
  import {pruneAlwaysInvalidatingScopes} from '../ReactiveScopes/PruneAlwaysInvalidatingScopes';
  import {stabilizeBlockIds} from '../ReactiveScopes/StabilizeBlockIds';
  import {
    eliminateRedundantPhi,
    enterSSA,
    rewriteInstructionKindsBasedOnReassignment,
  } from '../SSA';
  import {inferTypes} from '../TypeInference';
  import {
    validateContextVariableLValues,
    validateUseMemo,
  } from '../Validation';
  import {validateLocalsNotReassignedAfterRender} from '../Validation/ValidateLocalsNotReassignedAfterRender';
  import {propagatePhiTypes} from '../TypeInference/PropagatePhiTypes';
  import {propagateScopeDependenciesHIR} from '../HIR/PropagateScopeDependenciesHIR';
import {parse} from '@babel/parser'
import traverse, { NodePath } from '@babel/traverse'
import * as t from "@babel/types";
import {
    Environment,
    EnvironmentConfig,
    ReactFunctionType,
    parseEnvironmentConfig,
  } from '../HIR/Environment';
import generate from '@babel/generator';
const node = parse(`
function test(p0) {
        let v0, v1, v2, acc, panda_jmp0_reserved_param_p0, panda_jmp0_reserved_param_p1, panda_jmp0_reserved_param_p2;
        panda_jmp0_reserved_param_p2 = thisaa;
        acc = 16;
        v0 = acc;
        acc = 0;
        local_0_0 = acc;
        while (true) {
            acc = local_0_0;
            v1 = acc;
            acc = v0;
            acc = v1 < acc;
            if (!acc) break;
            acc = panda_jmp0_reserved_param_p2;
            acc = acc["counter"];
            acc = acc["arr"];
            v1 = acc;
            acc = local_0_0;
            v2 = acc;
            acc = local_0_0;
            acc = p0[acc];
            v1[v2] = acc;
            acc = local_0_0;
            acc = acc + 1;
            local_0_0 = acc;
        }
        acc = panda_jmp0_reserved_param_p2;
        return acc;
    }
    `,{
    allowImportExportEverywhere:true
}).program

traverse(t.file(node), {
    FunctionDeclaration:(value)=>{
        const ast = run(value,parseEnvironmentConfig({}).unwrap(),'Other','_panda_',null,null,null);
        const code = generate(t.functionDeclaration(ast.id,ast.params,ast.body,ast.generator,ast.async)).code;
        console.log(code)
    }
})

function run(
    func: NodePath<
      t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression
    >,
    config: EnvironmentConfig,
    fnType: ReactFunctionType,
    useMemoCacheIdentifier: string,
    logger: null,
    filename: string | null,
    code: string | null,
  ):CodegenFunction {
    const contextIdentifiers = findContextIdentifiers(func);
    const env = new Environment(
      func.scope,
      fnType,
      config,
      contextIdentifiers,
      logger,
      filename,
      code,
      useMemoCacheIdentifier,
    );
    return runWithEnvironment(func, env);
  }



function runWithEnvironment(
  func: NodePath<
    t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression
  >,
  env: Environment,
) :CodegenFunction{
  const hir = lower(func, env).unwrap();

  pruneMaybeThrows(hir);;

  validateContextVariableLValues(hir);
  validateUseMemo(hir);

  inlineImmediatelyInvokedFunctionExpressions(hir);

  mergeConsecutiveBlocks(hir);

  assertConsistentIdentifiers(hir);
  assertTerminalSuccessorsExist(hir);

  enterSSA(hir);

  eliminateRedundantPhi(hir);

  assertConsistentIdentifiers(hir);

  constantPropagation(hir);

  inferTypes(hir);

  analyseFunctions(hir);

//   inferReferenceEffects(hir);

//   validateLocalsNotReassignedAfterRender(hir);

  // Note: Has to come after infer reference effects because "dead" code may still affect inference
  deadCodeElimination(hir);

  pruneMaybeThrows(hir);

//   inferMutableRanges(hir);

//   inferReactivePlaces(hir);

  rewriteInstructionKindsBasedOnReassignment(hir);

  propagatePhiTypes(hir);

//   inferReactiveScopeVariables(hir);

  const fbtOperands = memoizeFbtAndMacroOperandsInSameScope(hir);

  alignMethodCallScopes(hir);


  alignObjectMethodScopes(hir);

  pruneUnusedLabelsHIR(hir);

  alignReactiveScopesToBlockScopesHIR(hir);

  mergeOverlappingReactiveScopesHIR(hir);

  assertValidBlockNesting(hir);

  buildReactiveScopeTerminalsHIR(hir);

  assertValidBlockNesting(hir);

  flattenReactiveLoopsHIR(hir);

  flattenScopesWithHooksOrUseHIR(hir);

  assertTerminalSuccessorsExist(hir);

  assertTerminalPredsExist(hir);

  propagateScopeDependenciesHIR(hir);

  const reactiveFunction = buildReactiveFunction(hir);
  console.log(printFunction(hir))

  assertWellFormedBreakTargets(reactiveFunction);

  pruneUnusedLabels(reactiveFunction);

  assertScopeInstructionsWithinScopes(reactiveFunction);

//   pruneNonEscapingScopes(reactiveFunction);

  pruneNonReactiveDependencies(reactiveFunction);

  pruneUnusedScopes(reactiveFunction);

  mergeReactiveScopesThatInvalidateTogether(reactiveFunction);

  pruneAlwaysInvalidatingScopes(reactiveFunction);


  propagateEarlyReturns(reactiveFunction);

  pruneUnusedLValues(reactiveFunction);

  promoteUsedTemporaries(reactiveFunction);

  extractScopeDeclarationsFromDestructuring(reactiveFunction);

  stabilizeBlockIds(reactiveFunction);

  const uniqueIdentifiers = renameVariables(reactiveFunction);

  pruneHoistedContexts(reactiveFunction);

  const ast = codegenFunction(reactiveFunction, {
    uniqueIdentifiers,
    fbtOperands,
  }).unwrap();

  return ast;
}
