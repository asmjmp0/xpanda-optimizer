import {parse} from '@babel/parser'
import * as t from "@babel/types";
import generate from '@babel/generator';
import { runWithAST } from '../ReCompilerSimplify';
import * as path from "path";
import {readFileSync,writeFileSync,readdirSync,statSync} from "fs"

function testDebugFile(){
  const inPath = path.resolve(__dirname,"debug.js");
  const outPath = path.resolve(__dirname,"debug_out.js");
  const inCode = readFileSync(inPath,"utf-8").toString()
  const node = parse(inCode,{
      allowImportExportEverywhere:true,
      allowSuperOutsideMethod:true
  }).program
  
  const program = t.file(node).program;
  const pro = runWithAST(program)
  const code = generate(pro).code
  writeFileSync(outPath,code);
}


function testDir(folderPath:string) {
  const files = readdirSync(folderPath);
  files.forEach(file => {
      const filePath = path.join(folderPath, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        testDir(filePath); // 递归遍历子文件夹
      } else {
          const inCode = readFileSync(filePath,"utf-8").toString()
          const node = parse(inCode,{
              allowImportExportEverywhere:true,
              allowSuperOutsideMethod:true
          }).program
          try{
            const program = t.file(node).program;
            const pro = runWithAST(program)
            const code = generate(pro).code
          }catch(e){
            console.log('error:' + filePath);
            console.log(e)
          }
      }
  });
}

// testDir('');
testDebugFile();

