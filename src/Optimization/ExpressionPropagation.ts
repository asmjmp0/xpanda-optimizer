import {
    HIRFunction,
    IdentifierId,
    Instruction,
    Place,
    printFunction,
    InstructionValue,
} from '../HIR';
import { printInstruction } from '../HIR/PrintHIR';


class Description{
    private preValue;
    private value;

    constructor(preValue:InstructionValue,value:Place){
        this.preValue = preValue;
        this.value = value;
    }

    getPreValue(){return this.preValue;}

    getValue(){return this.value;}

}

function effectKind(pre:InstructionValue):boolean{
    if(pre.kind === 'FunctionExpression' && pre.name?.startsWith('panda_opt_reserved_class')){
        return true;
    }
    return ['Await','CallExpression'].indexOf(pre.kind) !== -1;
}

function canNotMergeInstruction(instructions:Instruction[],now:Instruction):boolean{
    const index = instructions.indexOf(now);
    if(index === instructions.length -1) return false;
    //check next
    const next = instructions[index + 1];
    if(next.value.kind === 'LoadLocal') return false;
    // console.log(next.value.kind)
    // console.log(printInstruction(next))
    return true;
}

function generateInformation(fn: HIRFunction,map:Map<IdentifierId,Description>){
    for (const [, block] of fn.body.blocks) {
        for(let i = 0; i < block.instructions.length; ++i){
            const ins = block.instructions[i];
            if(ins.value.kind === 'StoreLocal' && ins.value.lvalue.kind === 'Reassign'){
                const preValue = block.instructions[i -1].value;
                map.set(ins.value.lvalue.place.identifier.id,new Description(preValue,ins.value.value))
            }
        }
    }
}


function expressionPropagationImpl(fn:HIRFunction):void{
    const map = new Map<IdentifierId,Description>();
    const set = new Set<IdentifierId>();
    generateInformation(fn, map);
    for (const [, block] of fn.body.blocks) {
        for(const ins of block.instructions){
            if(ins.value.kind === 'LoadLocal'){
               const desc = map.get(ins.value.place.identifier.id)
               if(desc){
                const preKind = desc.getPreValue();
                if(effectKind(preKind) && canNotMergeInstruction(block.instructions,ins)) continue;
                ins.value.place = desc.getValue();
               }
            }
        }
    }
}


export function expressionPropagation(fn: HIRFunction): void {
    // console.log(printFunction(fn))
    expressionPropagationImpl(fn)
    // console.log(printFunction(fn))

}