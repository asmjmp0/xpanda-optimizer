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

import traverse, { NodePath } from '@babel/traverse'
import * as t from "@babel/types";
import {
    Environment,
    EnvironmentConfig,
    ReactFunctionType,
    parseEnvironmentConfig
} from '../HIR/Environment';
import { transformFromAstSync } from '@babel/core';

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
  
  expressionPropagation(hir);

  constantPropagation(hir);

  inferTypes(hir);

//   analyseFunctions(hir);

  // inferReferenceEffects(hir);

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

    traverse(t.file(t.program([fake_func])),{
        CallExpression:(value)=>{
            const callee = value.node.callee;
            if(t.isImport(callee)){
                value.get('callee').replaceWith(t.identifier('panda_opt_reserved_import'))
            }
        },
        ClassExpression:(value)=>{
            const classExpression = value.node;
            const fake_id = classExpression.id?t.identifier("panda_opt_reserved_class_" + classExpression.id.name):t.identifier("panda_opt_reserved_class");
            const super_id = <t.Identifier>classExpression.superClass
            const arr = []
            for(const node of classExpression.body.body){
              if(t.isClassMethod(node)){
                const name = t.identifier((<t.Identifier>(node.key)).name + "_panda_jmp0_" + node.static + "_panda_jmp0_" + node.async + '_panda_jmp0_' + node.generator)
                const m_func = t.functionExpression(null,node.params as Array<t.Identifier | t.Pattern | t.RestElement>,node.body);
                const assignmentExpression = t.assignmentExpression('=',t.memberExpression(fake_id,name),m_func)
                arr.push(t.expressionStatement(assignmentExpression));
              }
            }
            const fake_block = t.blockStatement(arr);
            const fake_class_func = t.functionExpression(fake_id,[],fake_block);
            const assignmentExpression = t.assignmentExpression('=',t.memberExpression(fake_id,t.identifier("panda_opt_reserved_class_id")),super_id)
            value.getStatementParent()?.insertBefore(t.expressionStatement(assignmentExpression))
            value.replaceWith(fake_class_func)
        },
        ImportDeclaration:(value)=>{
            importDeclarations.push(value.node)
            value.remove();
        },
        ExportDeclaration:(value)=>{
            // ExportAllDeclaration | ExportDefaultDeclaration | ExportNamedDeclaration
            const object_id = t.identifier("panda_opt_reserved_export")
            let type_id:t.Identifier|null = null;
            let source:t.StringLiteral | null | undefined|t.Identifier = null;
            if(t.isExportAllDeclaration(value.node)){
                type_id = t.identifier("all");
                source = value.node.source;
            }else if (t.isExportDefaultDeclaration(value.node)){
                type_id = t.identifier("default");
                source  = <t.Identifier>value.node.declaration;
            }else if (t.isExportNamedDeclaration(value.node)){
                const s = <t.ExportSpecifier>value.node.specifiers[0];
                type_id = s.local;
                source = value.node.source;
            }
            const callExpression = t.callExpression(t.memberExpression(object_id,<t.Identifier>type_id),source?[source,<t.Identifier>type_id]:[<t.Identifier>type_id]);
            value.replaceWith(t.expressionStatement(callExpression));
        },
        SequenceExpression:(value)=>{
            const exps = value.node.expressions;
            if(exps.length <= 3) return;
            const need_size = exps.length - 3;
            const sts = exps.slice(0,need_size);
            const stss = exps.slice(need_size,exps.length);
            const parent = value.getStatementParent();
            sts.forEach((value)=>{
                parent?.insertBefore(t.expressionStatement(value));
            })
            value.node.expressions = stss;
        }
    });

    traverse(t.file(t.program([fake_func])),{
        FunctionExpression:(value)=>{
            if(getVisited(value)) return;
            try{
                const result = run(value,parseEnvironmentConfig({}).unwrap(),'Other','_c',null,null,null);
                value.replaceWith(t.functionExpression(result.id,result.params,result.body,result.generator,result.async))
            }catch(e){
                console.log(e)
            }
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

    traverse(t.file(p),{
        Identifier:(value)=>{
            const name = value.node.name;
            if(name === 'panda_opt_reserved_this'){
                value.replaceWith(t.thisExpression())
            }else if (name === 'panda_opt_reserved_super'){
                value.replaceWith(t.identifier("super"))
            }else if (name === 'panda_opt_reserved_import'){
                value.replaceWith(t.import())
            }
        },
        CallExpression:(value)=>{
            const callee = value.node.callee;
            if(t.isIdentifier(callee) && callee.name === 'panda_opt_reserved_yield'){
                const arg = value.node.arguments;
                if(arg.length === 0)
                    value.replaceWith(t.yieldExpression())
                else
                    value.replaceWith(t.yieldExpression(<t.Expression>arg[0]))
            }
            if(t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === 'panda_opt_reserved_export'){
                const type = <t.Identifier>callee.property;
                const param = value.node.arguments;
                const parent = value.getStatementParent();
                if(type.name === 'all'){
                    parent?.replaceWith(t.exportAllDeclaration(<t.StringLiteral>param[0]));
                }else if (type.name === 'default'){
                    parent?.replaceWith(t.exportDefaultDeclaration(<t.Identifier>param[0]));
                }else{
                    let source:t.StringLiteral | null = null;
                    let local:any;
                    if(param.length == 2){
                        source = <t.StringLiteral>param[0];
                        local = param[1]
                    }else{
                        local = param[0]
                    }
                    if(!t.isIdentifier(local)){
                        const id = t.identifier('panda_'+type.name);
                        parent?.insertBefore(t.variableDeclaration('const',[t.variableDeclarator(id,local)]));
                        parent?.replaceWith(t.exportNamedDeclaration(null,[t.exportSpecifier(id,type)],source))
                    }else{
                        parent?.replaceWith(t.exportNamedDeclaration(null,[t.exportSpecifier(<t.Identifier>local,type)],source))
                    }
                    
                }
            }
            
        },
        FunctionExpression:(value)=>{
            const id = value.node.id;
            if(id && id.name.startsWith("panda_opt_reserved_class")){
                const pre = value.getStatementParent()?.getPrevSibling();
                let super_id = null;
                let name_id = id.name === 'panda_opt_reserved_class'?null:t.identifier(id.name.split('panda_opt_reserved_class_')[1]);
                if(pre?.isExpressionStatement() && t.isAssignmentExpression(pre.node.expression)
                    && t.isMemberExpression(pre.node.expression.left)){
                        super_id = pre.node.expression.right;
                }
                pre?.remove();
                // decode compat class expression
                const mths:Array<t.ClassMethod> = []
                traverse(value.node,{
                    AssignmentExpression:(m)=>{
                        if(t.isMemberExpression(m.node.left) && t.isFunctionExpression(m.node.right)){
                            const obj = m.node.left.object;
                            const func = m.node.right;
                            if(t.isIdentifier(obj) && obj.name.startsWith(id.name)){
                                const prop_name = (<t.Identifier>m.node.left.property).name;
                                const detail = prop_name.split('_panda_jmp0_');
                                const name = detail[0];
                                const m_type = name === 'constructor'?'constructor':'method';
                                const isStatic = detail[1] === 'true';
                                const isAsync = detail[2] === 'true';
                                const isGenerator = detail[3] === 'true';
                                mths.push(t.classMethod(m_type,t.identifier(name),func.params,func.body,false,isStatic,isGenerator,isAsync))
                            }
                        }
                    }
                },value.scope)
                value.replaceWith(t.classExpression(name_id,super_id,t.classBody(mths)))
                value.scope.crawl()
            }
        },
        SequenceExpression:(value)=>{
            const exps = value.node.expressions;
            const need_define_name:Array<string> = [];
            for(let i = 0;i < exps.length; ++i){
                const item = exps[i];
                if(t.isIdentifier(item) && item.name.startsWith("panda_opt_reserved_need_define_")){
                    need_define_name.push(item.name.split("panda_opt_reserved_need_define_")[1])
                    delete exps[i];
                }else break;
            }
            const parent = value.getStatementParent();
            if(need_define_name.length === 0) return;
            parent?.insertBefore(t.variableDeclaration('let',need_define_name.map((value)=>{
                return t.variableDeclarator(t.identifier(value))
            })))
        }
    });

    p.body = importDeclarations.concat(p.body)

    return p;
}