export type OfflineProduct={id:string;name:string;internalCode:string;sku:string|null;barcode:string|null;salePrice:string;bulkSale:boolean;unit:string};
export type OfflineSalePayload={idempotencyKey:string;customerId:string|null;discount:string;items:Array<{productId:string;quantity?:string;chargedAmount?:string;discount:string}>;payments:Array<{method:string;amount:string}>};
export type PendingOfflineSale={id:string;scope:string;createdAt:string;total:number;payload:OfflineSalePayload;status:"PENDING"|"ERROR";error?:string};
type Catalog={scope:string;updatedAt:string;cashSessionId:string|null;products:OfflineProduct[]};

const DB_NAME="petflow-offline-sales-v1";

function openDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      db.createObjectStore("catalogs",{keyPath:"scope"});
      db.createObjectStore("sales",{keyPath:"id"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function store<T>(name:"catalogs"|"sales",mode:IDBTransactionMode,action:(objectStore:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(name,mode);
    const request=action(transaction.objectStore(name));
    transaction.oncomplete=()=>{db.close();resolve(request.result)};
    request.onerror=()=>{db.close();reject(request.error)};
    transaction.onerror=()=>{db.close();reject(transaction.error)};
  });
}

export async function saveCatalog(catalog:Catalog){await store("catalogs","readwrite",items=>items.put(catalog))}
export async function getCatalog(scope:string){return store<Catalog|undefined>("catalogs","readonly",items=>items.get(scope))}
export async function savePendingSale(sale:PendingOfflineSale){await store("sales","readwrite",items=>items.put(sale))}
export async function removePendingSale(id:string){await store("sales","readwrite",items=>items.delete(id))}
export async function getPendingSales(scope:string){
  const sales=await store<PendingOfflineSale[]>("sales","readonly",items=>items.getAll());
  return sales.filter(sale=>sale.scope===scope).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
