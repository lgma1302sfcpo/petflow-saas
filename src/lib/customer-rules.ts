const labels:Record<string,string>={fullName:"nome",phone:"telefone",address:"endereço",document:"documento",birthDate:"data de nascimento"};

export function missingRequiredCustomerFields(required:string[],customer:Record<string,unknown>){
  return required.filter(field=>{
    const value=customer[field];
    return value===null||value===undefined||(typeof value==="string"&&!value.trim());
  });
}

export function requiredCustomerFieldsMessage(fields:string[]){
  return `Preencha os campos obrigatórios: ${fields.map(field=>labels[field]??field).join(", ")}.`;
}
