import fs from 'node:fs';
import {parse} from 'acorn';
import {generate} from 'astring';
const [input,output]=process.argv.slice(2);
const ast=parse(fs.readFileSync(input,'utf8'),{ecmaVersion:'latest',sourceType:'module'});
const id=name=>({type:'Identifier',name});
const call=(name,args)=>({type:'CallExpression',callee:id(name),arguments:args,optional:false});
let templates=0,sinks=0;
function visit(node,parent,key){
  if(!node||typeof node!=='object')return node;
  for(const field of Object.keys(node)){
    if(Array.isArray(node[field]))node[field]=node[field].map(child=>visit(child,node,field));
    else if(node[field]&&typeof node[field]==='object')node[field]=visit(node[field],node,field);
  }
  if(node.type==='TemplateLiteral'&&node.quasis.some(q=>/<\/?[a-z]/i.test(q.value.cooked))){templates++;return {type:'TaggedTemplateExpression',tag:id('safeHTML'),quasi:node};}
  if(node.type==='Literal'&&typeof node.value==='string'&&/<\/?[a-z][^>]*>/i.test(node.value))return call('staticHTML',[node]);
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.property.name==='join')return call('htmlJoin',[node.callee.object,...node.arguments]);
  if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&!node.left.computed){
    if(node.left.property.name==='innerHTML'){node.right=call('renderHTML',[node.right]);sinks++;}
    if(node.left.property.name==='src')node.right=call('imageURL',[node.right]);
  }
  return node;
}
fs.writeFileSync(output,generate(visit(ast)));
console.log(`Secured ${templates} markup templates and ${sinks} HTML sinks.`);
