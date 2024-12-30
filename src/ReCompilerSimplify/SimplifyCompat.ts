import traverse, { NodePath } from '@babel/traverse'
import * as t from "@babel/types";

function preCompatImport(value:NodePath<t.CallExpression>){
    const callee = value.node.callee;
    if(t.isImport(callee)){
        value.get('callee').replaceWith(t.identifier('panda_opt_reserved_import'))
    }
}

function preClassCompat(value:NodePath<t.ClassExpression>){
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
}

function preExportCompat(value:NodePath<t.ExportDeclaration>){
    const object_id = t.identifier("panda_opt_reserved_export")
    let type_id:t.Identifier|null = null;
    let source:t.StringLiteral | null | undefined|t.Identifier = null;
    let localName:t.Identifier | null = null;
    let callExpression;
    if(t.isExportAllDeclaration(value.node)){
        type_id = t.identifier("all");
        source = value.node.source;
        callExpression = t.callExpression(t.memberExpression(object_id,<t.Identifier>type_id),source?[source,<t.Identifier>type_id]:[<t.Identifier>type_id]);
    }else if (t.isExportDefaultDeclaration(value.node)){
        type_id = t.identifier("default");
        source  = <t.Identifier>value.node.declaration;
        callExpression = t.callExpression(t.memberExpression(object_id,<t.Identifier>type_id),source?[source,<t.Identifier>type_id]:[<t.Identifier>type_id]);
    }else if (t.isExportNamedDeclaration(value.node)){
        const s = <t.ExportSpecifier>value.node.specifiers[0];
        type_id = <t.Identifier>s.exported;
        localName = s.local;
        source = value.node.source;
        callExpression = t.callExpression(t.memberExpression(object_id,<t.Identifier>type_id),source?[source,<t.Identifier>localName]:[<t.Identifier>localName]);
    }
    value.replaceWith(t.expressionStatement(<t.CallExpression>callExpression));
}

function preSequenceExpressionCompat(value:NodePath<t.SequenceExpression>){
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

/**  fix function begin... ***/

function fixReservedIdentifier(value:NodePath<t.Identifier>){
    const name = value.node.name;
    if(name === 'panda_opt_reserved_this'){
        value.replaceWith(t.thisExpression())
    }else if (name === 'panda_opt_reserved_super'){
        value.replaceWith(t.identifier("super"))
    }else if (name === 'panda_opt_reserved_import'){
        value.replaceWith(t.import())
    }
}

function fixYield(value:NodePath<t.CallExpression>){
    const callee = value.node.callee;
    if(t.isIdentifier(callee) && callee.name === 'panda_opt_reserved_yield'){
        const arg = value.node.arguments;
        if(arg.length === 0)
            value.replaceWith(t.yieldExpression())
        else
            value.replaceWith(t.yieldExpression(<t.Expression>arg[0]))
    }
}

function fixExportDeclaration(value:NodePath<t.CallExpression>){
    const callee = value.node.callee;
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
}

function fixClassExpression(value:NodePath<t.FunctionExpression>){
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
}

function fixSequenceExpression(value:NodePath<t.SequenceExpression>){
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


export function preSimplifyComapt(importDeclarations:Array<t.Statement>,fake_func:t.FunctionDeclaration){
    traverse(t.file(t.program([fake_func])),{
        CallExpression:(value)=>{
            preCompatImport(value);
        },
        ClassExpression:(value)=>{
            preClassCompat(value)
        },
        ImportDeclaration:(value)=>{
            importDeclarations.push(value.node)
            value.remove();
        },
        ExportDeclaration:(value)=>{
            // ExportAllDeclaration | ExportDefaultDeclaration | ExportNamedDeclaration
            preExportCompat(value);
        },
        SequenceExpression:(value)=>{
            preSequenceExpressionCompat(value);
        },
        BreakStatement:(value)=>{
            //remove raw break dead code
            const parent = value.getStatementParent();
            if(parent?.isIfStatement()) return;
            const pp = parent?.parentPath.parent;
            if(t.isDoWhileStatement(pp) || t.isWhileStatement(pp)){
                value.remove();
            }
        }
    });
}

export function fixSimplifyComapt(importDeclarations:Array<t.Statement>,p:t.Program){

    traverse(t.file(p),{
        Identifier:(value)=>{
            fixReservedIdentifier(value)
        },
        CallExpression:(value)=>{
            fixYield(value);
            fixExportDeclaration(value);
            
        },
        FunctionExpression:(value)=>{
            fixClassExpression(value);
        },
        SequenceExpression:(value)=>{
            fixSequenceExpression(value)
        }
    });

    p.body = importDeclarations.concat(p.body)
}
