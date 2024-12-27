import * as TYPE from '@babel/types';

/**
 * @Author: jmp0
 * @Email: jmp0@qq.com
 */
export interface ISimplify{
    simplify(node:TYPE.Program):void;
}