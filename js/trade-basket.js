(function () {
  const Core = window.MTGCollectionCore;
  const basketKey='mtg-trade-basket-v1', shoppingKey='mtg-shopping-list-v1';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(_){return[]}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const money=value=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value||0);
  let items=read(basketKey), shopping=read(shoppingKey);
  const shoppingPrefill=new URLSearchParams(location.search).get('shopping');
  if(shoppingPrefill)$('shopping-name').value=shoppingPrefill;
  $('generated-date').textContent=`Generated ${new Intl.DateTimeFormat('en-AU',{dateStyle:'long'}).format(new Date())}`;
  fetch('data/config.json').then(response=>response.ok?response.json():{}).then(config=>{
    if(!config.requesterName)return;
    $('requester-name').hidden=false;
    $('requester-name').textContent=`Requested by ${config.requesterName}`;
  }).catch(()=>{});
  function render(){
    const groups=Core.groupBasketByOwner(items);
    $('basket-content').innerHTML=Object.values(groups).map(group=>{
      const subtotal=group.items.reduce((s,item)=>s+(Number(item.marketPrice)||0)*item.quantityRequested,0);
      return `<section class="owner-request"><h2>${esc(group.ownerName)}</h2>${group.items.map(item=>`<article class="request-row">
        ${item.imageUri?`<img src="${esc(item.imageUri)}" alt="">`:''}<div><h3>${esc(item.cardName)}</h3><p>${esc(item.setCode)} #${esc(item.collectorNumber)} · ${esc(item.finish)} · ${esc(item.condition||'Condition unknown')}</p><p>${esc(item.binder||'No binder')} · Requested: ${item.quantityRequested}${item.note?` · ${esc(item.note)}`:''}</p></div>
        <div class="basket-edit"><label>Qty <input data-qty="${esc(item.collectionItemId)}" type="number" min="1" max="${item.quantityOwned}" value="${item.quantityRequested}"></label><button data-remove="${esc(item.collectionItemId)}" type="button">Remove</button></div></article>`).join('')}
        ${subtotal?`<p><strong>Estimated market value: ${money(subtotal)}</strong></p>`:''}</section>`;
    }).join('')||'<div class="empty-state"><h2>Your Trade Basket is empty</h2><p>Add a specific owned copy from All Collections or a library.</p><a href="all-collections.html">Search all collections</a></div>';
    const count=items.reduce((s,item)=>s+item.quantityRequested,0);
    $('basket-feedback').textContent=`${count} requested card${count===1?'':'s'} across ${Object.keys(groups).length} owner${Object.keys(groups).length===1?'':'s'}.`;
    $('shopping-content').innerHTML=shopping.map((item,index)=>`<article class="shopping-row"><strong>${esc(item.cardName)} ×${item.quantity}</strong><span>${esc(item.preferredPrinting||'Any printing')} ${item.note?`· ${esc(item.note)}`:''}</span><button type="button" data-shopping-remove="${index}">Remove</button></article>`).join('')||'<p>No shopping-list cards yet.</p>';
  }
  function text(markdown=false){
    const groups=Core.groupBasketByOwner(items);
    const lines=[markdown?'# Cards I’m interested in':'Cards I’m interested in',''];
    Object.values(groups).forEach(group=>{lines.push(markdown?`## ${group.ownerName}`:`${group.ownerName}:`);group.items.forEach(item=>lines.push(`- ${item.cardName} — ${item.setCode} ${item.collectorNumber} — ${item.finish} — ${item.condition||'condition unknown'} — x${item.quantityRequested}${item.note?` — ${item.note}`:''}`));lines.push('')});
    return lines.join('\n');
  }
  async function copy(value){try{await navigator.clipboard.writeText(value);$('basket-feedback').textContent='Copied successfully.'}catch(_){$('basket-feedback').textContent='Copy failed. Select the text manually or try HTTPS.'}}
  function download(name,type,content){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
  $('basket-content').addEventListener('change',e=>{if(!e.target.matches('[data-qty]'))return;const item=items.find(i=>i.collectionItemId===e.target.dataset.qty);if(item)item.quantityRequested=Math.max(1,Math.min(item.quantityOwned,Number(e.target.value)||1));write(basketKey,items);render()});
  $('basket-content').addEventListener('click',e=>{const btn=e.target.closest('[data-remove]');if(!btn)return;items=Core.removeBasketItem(items,btn.dataset.remove);write(basketKey,items);render()});
  $('copy-text').onclick=()=>copy(text(false));$('copy-markdown').onclick=()=>copy(text(true));
  $('download-json').onclick=()=>download('trade-request.json','application/json',JSON.stringify(items,null,2));
  $('download-csv').onclick=()=>{const rows=[['Owner','Card','Set','Collector number','Finish','Condition','Quantity','Note'],...items.map(i=>[i.ownerName,i.cardName,i.setCode,i.collectorNumber,i.finish,i.condition,i.quantityRequested,i.note])];download('trade-request.csv','text/csv',rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n'))};
  $('print').onclick=()=>print();$('screenshot').onclick=()=>document.body.classList.add('screenshot-mode');$('exit-screenshot').onclick=()=>document.body.classList.remove('screenshot-mode');
  $('shopping-form').onsubmit=e=>{e.preventDefault();shopping.push({cardName:$('shopping-name').value.trim(),quantity:Number($('shopping-quantity').value)||1,preferredPrinting:$('shopping-printing').value.trim(),note:$('shopping-note').value.trim()});write(shoppingKey,shopping);e.target.reset();$('shopping-quantity').value=1;render()};
  $('shopping-content').onclick=e=>{const btn=e.target.closest('[data-shopping-remove]');if(!btn)return;shopping.splice(Number(btn.dataset.shoppingRemove),1);write(shoppingKey,shopping);render()};
  render();
})();
