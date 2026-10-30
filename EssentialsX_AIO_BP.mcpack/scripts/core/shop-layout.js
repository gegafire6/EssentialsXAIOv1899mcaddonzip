// Fixed 5-column form collection: each category spans two cells, then three item slots.
// Explicit filler entries keep every native grid index aligned with ActionFormData.
export const SHOP_THEME_MARKER = '§0§r§2§r';
export const SHOP_ROWS = 5;
export const SHOP_COLUMNS = 5;
export const SHOP_PAGE_SIZE = 15;
export const SHOP_BUTTON_COUNT = 35;
const clamp = (value, length) => Math.max(0, Math.min(Number.isFinite(value) ? Math.floor(value) : 0, Math.max(0,length-1)));
export function buildShopPage(categories, selected = 0, categoryPage = 0, itemPage = 0, options = {}) {
  const ci = clamp(selected,categories.length), category = categories[ci];
  const categoryPages = Math.max(1,Math.ceil(categories.length/SHOP_ROWS));
  const cp = clamp(categoryPage,categoryPages);
  const items = category?.items ?? [];
  const itemPages = Math.max(1,Math.ceil(items.length/SHOP_PAGE_SIZE));
  const ip = clamp(itemPage,itemPages), buttons=[];
  const filler = () => ({text:' ',icon:'',kind:'empty'});
  for(let row=0;row<SHOP_ROWS;row++) {
    const categoryIndex=cp*SHOP_ROWS+row,c=categories[categoryIndex];
    buttons.push(c ? {text:(categoryIndex===ci?'§2§r§a§l':'§f')+c.name,icon:c.icon || 'textures/ui/essx/icons/shop',kind:'category',index:categoryIndex} : filler());
    buttons.push(filler());
    for(let col=0;col<3;col++) {
      const ii=ip*SHOP_PAGE_SIZE+row*3+col,it=items[ii];
      buttons.push(it ? {text:`§f${options.name?.(it) ?? it.t}\n§a${options.currency?.(it.buy) ?? it.buy} §7×${it.amount}`,icon:options.icon?.(it) ?? '',kind:'item',category:ci,index:ii} : filler());
    }
  }
  buttons.push({text:`§fCategories ${cp+1}/${categoryPages} ›`,icon:'textures/ui/essx/icons/menu',kind:'categories',page:(cp+1)%categoryPages},filler(),
    {text:'§f‹ Previous',icon:'textures/ui/essx/icons/back',kind:ip>0?'items':'empty',page:ip-1},
    {text:`§7${ip+1} / ${itemPages}`,icon:'',kind:'empty'},
    {text:'§fNext ›',icon:'textures/ui/essx/icons/teleport',kind:ip+1<itemPages?'items':'empty',page:ip+1});
  buttons.push({text:'§aSell Items',icon:'textures/ui/essx/icons/wallet',kind:'sell'},filler(),
    {text:'§fBack',icon:'textures/ui/essx/icons/back',kind:'back'},
    {text:'§fList View',icon:'textures/ui/essx/icons/menu',kind:'classic'},
    {text:'§cClose',icon:'textures/ui/essx/icons/close',kind:'close'});
  return {category:ci,categoryPage:cp,itemPage:ip,categoryPages,itemPages,title:category?.name ?? 'No categories',buttons};
}
