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
    inlineImmediatelyInvokedFunctionExpressions,
    analyseFunctions
} from '../Inference';
import {
    constantPropagation,
    deadCodeElimination,
    pruneMaybeThrows,
    expressionPropagation
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
import {propagatePhiTypes} from '../TypeInference/PropagatePhiTypes';
import {propagateScopeDependenciesHIR} from '../HIR/PropagateScopeDependenciesHIR';
import {
    Environment,
    EnvironmentConfig,
    ReactFunctionType,
    parseEnvironmentConfig
} from '../HIR/Environment';

import traverse, { NodePath } from '@babel/traverse'
import * as t from "@babel/types";

import { preSimplifyComapt, fixSimplifyComapt } from './SimplifyCompat';

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
  
//   expressionPropagation(hir);

  constantPropagation(hir);

  inferTypes(hir);

//   analyseFunctions(hir);

  // inferReferenceEffects(hir);

//   validateLocalsNotReassignedAfterRender(hir);

  // Note: Has to come after infer reference effects because "dead" code may still affect inference
  deadCodeElimination(hir);

//   expressionPropagation(hir);

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

function setVisited(value:NodePath<t.Node>){
    if(!value.node.extra){
        value.node.extra = {};
    }
    value.node.extra["expSimpilyed"] = true;
}

function getVisited(value:NodePath<t.Node>){
    return value.node.extra?.["expSimpilyed"];
}

export function runWithAST(node:t.Program):t.Program{
    const fake_func = t.functionDeclaration(t.identifier("panda_opt_fake_main_0"),[],t.blockStatement(node.body));
    let result_func:CodegenFunction|null = null;
    let importDeclarations:Array<t.Statement> = [];

    preSimplifyComapt(importDeclarations,fake_func);

    traverse(t.file(t.program([fake_func])),{
        FunctionExpression:(value)=>{
            if(getVisited(value)) return;
            const result = run(value,parseEnvironmentConfig({}).unwrap(),'Other','_c',null,null,null);
            value.replaceWith(t.functionExpression(result.id,result.params,result.body,result.generator,result.async))
            setVisited(value);
        }
    });


    traverse(t.file(t.program([fake_func])),{
        FunctionDeclaration:(value)=>{
            if(value.node.id?.name === 'panda_opt_fake_main_0'){
                result_func = run(value,parseEnvironmentConfig({}).unwrap(),'Other','_c',null,null,null);
            }
        },
    });

    const p = t.program((<CodegenFunction><unknown>result_func).body.body);

    fixSimplifyComapt(importDeclarations,p);

    return p;
}