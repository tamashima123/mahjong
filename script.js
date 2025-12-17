/**
 * Ultimate JS Mahjong v3.1 - With Title Screen & Fixes
 */

const TILE_MAP = {
    m: "🀇🀈🀉🀊🀋🀌🀍🀎🀏", p: "🀙🀚🀛🀜🀝🀞🀟🀠🀡", s: "🀐🀑🀒🀓🀔🀕🀖🀗🀘", z: "🀀🀁🀂🀃🀆🀅🀄"
};

class Tile {
    constructor(id) {
        this.id = id; this.type = id.substr(1, 1); this.num = parseInt(id.substr(0, 1));
        this.char = TILE_MAP[this.type][this.num - 1];
        this.uid = Math.random().toString(36).substr(2, 9);
    }
    get value() { return { m: 0, p: 1, s: 2, z: 3 }[this.type] * 100 + this.num; }
    get isYaochu() { return this.type === 'z' || this.num === 1 || this.num === 9; }
    get isGreen() { return (this.type === 's' && [2,3,4,6,8].includes(this.num)) || this.id === '6z'; }
}

class ScoreCalculator {
    static calc(yakuList, han, fu, isParent, isTsumo) {
        const yakumans = yakuList.filter(y => y.includes("役満"));
        if (yakumans.length > 0) {
            const base = 8000 * 4 * yakumans.length;
            return this.getPayments(base, isParent, isTsumo, "役満");
        }
        if (yakuList.includes("七対子")) fu = 25;
        else if (fu === 20 && !isTsumo) fu = 30;

        let basic = fu * Math.pow(2, han + 2);
        let title = "";
        if (basic > 2000 || han >= 5) {
            if (han >= 13) { basic = 32000; title = "数え役満"; }
            else if (han >= 11) { basic = 24000; title = "三倍満"; }
            else if (han >= 8) { basic = 16000; title = "倍満"; }
            else if (han >= 6) { basic = 12000; title = "跳満"; }
            else { basic = 8000; title = "満貫"; }
        }
        return this.getPayments(basic, isParent, isTsumo, title);
    }
    static getPayments(basic, isParent, isTsumo, title) {
        const ceil100 = (n) => Math.ceil(n / 100) * 100;
        let pay = {}, total = 0, text = "";
        if (isTsumo) {
            if (isParent) {
                const p = ceil100(basic * 2 / 3); // 親ツモはbasic*2を3人で割る感覚(簡易: basic*2/3 ≒ all) 
                // 正確には: basic/100*2 -> 切り上げ *100
                // ここでは標準的な計算: 親ツモはALL(basic/100*2切り上げ*100)
                const unit = ceil100(basic * 2 / 4); // 正確な親ツモ計算: 総額basic*1.5, 各自basic*0.5
                // ※修正: basicは「子のアガリ点」ベース(8000)。親は1.5倍(12000)。
                // 親ツモの支払い: (12000/3)=4000オール
                // このコードのbasicは「満貫=8000」としている
                
                // 再計算: basic=基本点(満貫2000)。親満貫=12000(基本点*6)。子満貫=8000(基本点*4)。
                // ここではbasic変数に「子のロンあがり点(8000)」が入っている前提で計算
                const actualBase = basic / 4; // 2000
                const pPay = ceil100(actualBase * 2);
                pay = { all: pPay }; total = pPay * 3; text = `${pPay}オール`;
            } else {
                const actualBase = basic / 4;
                const childP = ceil100(actualBase);
                const parentP = ceil100(actualBase * 2);
                pay = { parent: parentP, child: childP };
                total = parentP + childP * 2;
                text = `${childP} / ${parentP}`;
            }
        } else {
            const multi = isParent ? 6 : 4;
            // basicには8000が入っているので、これを基準に
            total = ceil100(basic * (isParent?1.5:1));
            pay = { target: total }; text = `${total}`;
        }
        return { score: total, payText: text, title: title };
    }
    static calcFu(hand, groups, melds, winTile, ctx, yakuList) {
        if (yakuList.includes("七対子")) return 25;
        if (yakuList.includes("平和") && ctx.isTsumo) return 20;
        let fu = 20;
        if (ctx.isMenzen && !ctx.isTsumo) fu += 10;
        if (ctx.isTsumo) fu += 2;
        groups.forEach(g => {
            if (g.type === 'koutsu' || g.type === 'kan') {
                let s = 2;
                if (g.tiles[0].isYaochu) s *= 2;
                if (!g.isOpen) s *= 2;
                if (g.type === 'kan') s *= 4;
                fu += s;
            }
            if (g.type === 'head') {
                const id = g.tiles[0].id;
                if (['5z','6z','7z', ctx.bakaze, (ctx.parent===0?'1z':'2z')].includes(id)) fu += 2;
            }
        });
        const head = groups.find(g => g.type === 'head');
        if (head && head.tiles[0].id === winTile.id) fu += 2; // 単騎
        const shuntsu = groups.find(g => g.type === 'shuntsu' && g.tiles.some(t => t.id === winTile.id));
        if (shuntsu) {
            const nums = shuntsu.tiles.map(t => t.num).sort((a,b)=>a-b);
            const w = winTile.num;
            if (nums[1] === w) fu += 2; // カンチャン
            else if ((nums[0]===1 && nums[1]===2 && w===3) || (nums[1]===8 && nums[2]===9 && w===7)) fu += 2; // ペンチャン
        }
        return Math.ceil(fu / 10) * 10; // 切り上げ
    }
}

class Checker {
    static solve(hand, melds, winTile, ctx, doras) {
        const fullHand = [...hand];
        const cnt = this.countMap(fullHand);
        const yakumans = this.checkYakuman(fullHand, melds, cnt, winTile, ctx);
        if (yakumans.length > 0) {
            const calc = ScoreCalculator.calc(yakumans, 13, 0, ctx.parent === 0, ctx.isTsumo);
            return { canWin: true, yaku: yakumans, score: calc.score, text: calc.payText, title: "役満", fu: 0, han: 13 };
        }

        let best = { canWin: false, score: 0 };
        // 七対子
        if (melds.length === 0) {
            let pairs = 0; for(let k in cnt) if(cnt[k]===2) pairs++;
            if (pairs === 7) {
                const yaku = ["七対子"];
                if(ctx.isRiichi) yaku.push("立直");
                if(ctx.isTsumo) yaku.push("門前清自摸和");
                if(this.isTanyao(Object.keys(cnt))) yaku.push("断幺九");
                if(this.isHonitsu(fullHand)) yaku.push("混一色");
                if(this.isChinitsu(fullHand)) yaku.push("清一色");
                const dC = this.countDora(fullHand, doras); for(let i=0;i<dC;i++) yaku.push("ドラ");
                const han = yaku.length + (yaku.includes("混一色")?1:0) + (yaku.includes("清一色")?4:0);
                const calc = ScoreCalculator.calc(yaku, han, 25, ctx.parent===0, ctx.isTsumo);
                if (calc.score > best.score) best = { canWin: true, yaku: yaku, score: calc.score, text: calc.payText, title: calc.title, fu: 25, han: han };
            }
        }

        const forms = this.decomposeAll(cnt, 4 - melds.length);
        forms.forEach(groups => {
            const allGroups = groups.map(g => ({ ...g, isOpen: false }));
            melds.forEach(m => { allGroups.push({ type: m.type==='chi'?'shuntsu':(m.type==='kan'?'kan':'koutsu'), tiles: m.tiles, isOpen: true }); });
            
            const yakuList = this.calcNormalYaku(allGroups, fullHand, melds, winTile, ctx);
            if (yakuList.length > 0) {
                const dC = this.countDora(fullHand, doras); for(let i=0;i<dC;i++) yakuList.push("ドラ");
                let han = 0;
                yakuList.forEach(y => {
                    if(["清一色"].includes(y)) han += (ctx.isMenzen?6:5);
                    else if(["純全帯么九"].includes(y)) han += (ctx.isMenzen?3:2);
                    else if(["混一色","混全帯么九"].includes(y)) han += (ctx.isMenzen?3:2);
                    else if(["対々和","三暗刻","三色同順","一気通貫","ダブル立直","七対子"].includes(y)) han += (ctx.isMenzen?2:1);
                    else han += 1;
                });
                if(!ctx.isMenzen) { if(yakuList.includes("三色同順")) han--; if(yakuList.includes("一気通貫")) han--; }
                
                const fu = ScoreCalculator.calcFu(fullHand, allGroups, melds, winTile, ctx, yakuList);
                const calc = ScoreCalculator.calc(yakuList, han, fu, ctx.parent===0, ctx.isTsumo);
                if (calc.score > best.score) best = { canWin: true, yaku: yakuList, score: calc.score, text: calc.payText, title: calc.title, fu: fu, han: han };
            }
        });
        return best.canWin ? best : { canWin: false, yaku: [] };
    }

    static checkYakuman(hand, melds, cnt, winTile, ctx) {
        const res = [];
        const all = [...hand, ...melds.flatMap(m => m.tiles)];
        if(melds.length===0 && Object.keys(cnt).filter(k=>"1m9m1p9p1s9s1z2z3z4z5z6z7z".includes(k)).length===13 && Object.values(cnt).includes(2)) res.push("国士無双");
        if(melds.length===0 && ctx.isTsumo && Object.values(cnt).filter(v=>v>=3).length===4) res.push("四暗刻");
        if(this.countType(all,'5z')>=3 && this.countType(all,'6z')>=3 && this.countType(all,'7z')>=3) res.push("大三元");
        if(all.every(t=>t.type==='z')) res.push("字一色");
        if(all.every(t=>t.isGreen)) res.push("緑一色");
        if(all.every(t=>t.isYaochu && t.type!=='z')) res.push("清老頭");
        if(ctx.isTenho) res.push("天和");
        else if(ctx.isChiho) res.push("地和");
        return res;
    }
    static calcNormalYaku(groups, hand, melds, winTile, ctx) {
        let yaku = [];
        const isMenzen = melds.length === 0;
        const all = [...hand, ...melds.flatMap(m => m.tiles)];
        const ids = all.map(t => t.id);

        if (ctx.isRiichi) yaku.push("立直");
        if (ctx.isDoubleRiichi) yaku.push("ダブル立直");
        if (ctx.isIppatsu) yaku.push("一発");
        if (isMenzen && ctx.isTsumo) yaku.push("門前清自摸和");
        if (this.isTanyao(ids)) yaku.push("断幺九");
        
        groups.forEach(g => {
            if (g.type === 'koutsu' || g.type === 'kan') {
                const id = g.tiles[0].id;
                if (id==='5z') yaku.push("白"); if (id==='6z') yaku.push("發"); if (id==='7z') yaku.push("中");
                if (id===ctx.bakaze) yaku.push("場風牌"); if (id===(ctx.parent===0?'1z':'2z')) yaku.push("自風牌");
            }
        });
        if (this.isPinfu(groups, melds, ctx.bakaze, '1z')) yaku.push("平和");
        if (isMenzen && this.checkIipeiko(groups)) yaku.push("一盃口");
        if (ctx.isHaitei && ctx.isTsumo) yaku.push("海底摸月");
        if (ctx.isHoutei && !ctx.isTsumo) yaku.push("河底撈魚");
        if (ctx.isRinshan) yaku.push("嶺上開花");

        if (this.checkToitoi(groups)) yaku.push("対々和");
        if (this.checkSanankou(groups, ctx.isTsumo, winTile)) yaku.push("三暗刻");
        if (this.checkSanshoku(groups)) yaku.push("三色同順");
        if (this.checkIttsu(groups)) yaku.push("一気通貫");
        if (this.checkChanta(groups)) yaku.push("混全帯么九");
        if (this.checkJunchan(groups)) yaku.push("純全帯么九");
        if (this.checkHonroutou(groups)) yaku.push("混老頭");
        if (this.isChinitsu(all)) yaku.push("清一色");
        else if (this.isHonitsu(all)) yaku.push("混一色");
        if (this.countType(all,'5z')>=2 && this.countType(all,'6z')>=2 && this.countType(all,'7z')>=2 && groups.some(g=>g.type==='head' && ['5z','6z','7z'].includes(g.tiles[0].id))) yaku.push("小三元");

        return yaku;
    }

    static countType(ts, id) { return ts.filter(t => t.id === id).length; }
    static isTanyao(ids) { return ids.every(id => !id.includes('z') && !id.startsWith('1') && !id.startsWith('9')); }
    static isHonitsu(ts) { const hasZ = ts.some(t => t.type==='z'); const types = new Set(ts.filter(t => t.type!=='z').map(t=>t.type)); return types.size===1 && hasZ; }
    static isChinitsu(ts) { return ts.every(t=>t.type!=='z') && new Set(ts.map(t=>t.type)).size===1; }
    static checkToitoi(gs) { return gs.every(g => g.type !== 'shuntsu'); }
    static checkSanankou(gs, isTsumo, w) {
        let ankous = 0;
        gs.forEach(g => {
            if((g.type==='koutsu'||g.type==='kan') && !g.isOpen) {
                if(!isTsumo && g.tiles.some(t=>t.id===w.id)) {} else ankous++;
            }
        });
        return ankous >= 3;
    }
    static checkIipeiko(gs) { const sh = gs.filter(g=>g.type==='shuntsu').map(g=>g.tiles[0].id); return sh.length - new Set(sh).size >= 1; }
    static checkSanshoku(gs) { const m={}; gs.filter(g=>g.type==='shuntsu').forEach(g=>{const n=g.tiles[0].num; if(!m[n])m[n]=[]; if(!m[n].includes(g.tiles[0].type))m[n].push(g.tiles[0].type);}); return Object.values(m).some(v=>v.includes('m')&&v.includes('p')&&v.includes('s')); }
    static checkIttsu(gs) { const m={m:[],p:[],s:[]}; gs.filter(g=>g.type==='shuntsu').forEach(g=>m[g.tiles[0].type].push(g.tiles[0].num)); return Object.values(m).some(n=>n.includes(1)&&n.includes(4)&&n.includes(7)); }
    static checkChanta(gs) { return gs.every(g=>g.tiles.some(t=>t.isYaochu)) && gs.some(g=>g.tiles[0].type==='z') && gs.some(g=>g.tiles[0].type!=='z'); }
    static checkJunchan(gs) { return gs.every(g=>g.tiles.some(t=>t.isYaochu && t.type!=='z')); }
    static checkHonroutou(gs) { return gs.every(g=>g.type!=='shuntsu' && g.tiles[0].isYaochu); }
    static isPinfu(gs, melds, ba, ji) {
        if(melds.length>0) return false;
        if(!gs.every(g=>g.type==='shuntsu' || g.type==='head')) return false;
        const h = gs.find(g=>g.type==='head');
        if(!h || ['5z','6z','7z',ba,ji].includes(h.tiles[0].id)) return false;
        return true;
    }
    
    static decomposeAll(cnt, needed) {
        const res = []; this._bt(cnt, needed, [], res); return res;
    }
    static _bt(cnt, needed, cur, res) {
        if (needed === 0) {
            for(let k in cnt) if(cnt[k]===2) { res.push([...cur, {type:'head', tiles:[new Tile(k), new Tile(k)]}]); return; }
            return;
        }
        let f = Object.keys(cnt).sort().find(k=>cnt[k]>0);
        if(!f) return;
        if(cnt[f]>=3) {
            cnt[f]-=3; cur.push({type:'koutsu', tiles:[new Tile(f), new Tile(f), new Tile(f)]});
            this._bt(cnt, needed-1, cur, res); cur.pop(); cnt[f]+=3;
        }
        if(!f.includes('z') && parseInt(f[0])<=7) {
            const n=parseInt(f[0]), t=f[1], n2=(n+1)+t, n3=(n+2)+t;
            if(cnt[n2]>0 && cnt[n3]>0) {
                cnt[f]--; cnt[n2]--; cnt[n3]--; cur.push({type:'shuntsu', tiles:[new Tile(f), new Tile(n2), new Tile(n3)]});
                this._bt(cnt, needed-1, cur, res); cur.pop(); cnt[f]++; cnt[n2]++; cnt[n3]++;
            }
        }
    }
    static countMap(h) { const c={}; h.forEach(t=>c[t.id]=(c[t.id]||0)+1); return c; }
    static checkTenpai(h) { 
        const allIds = []; ['m','p','s'].forEach(t=>{for(let i=1;i<=9;i++) allIds.push(i+t)}); ['z'].forEach(t=>{for(let i=1;i<=7;i++) allIds.push(i+t)});
        for(let id of allIds) {
            if(this.decomposeAll(this.countMap([...h, new Tile(id)]), 4).length > 0) return true;
        }
        return false;
    }
    static canKan(h) { return Object.values(this.countMap(h)).some(n=>n===4); }
    static canChi(h, t) { return this.getChiCandidates(h, t).length > 0; }
    static getChiCandidates(h, tile) {
        const n=tile.num, t=tile.type, res=[];
        const has=(num)=>h.some(x=>x.type===t && x.num===num);
        if(has(n-2)&&has(n-1)) res.push([new Tile(`${n-2}${t}`), new Tile(`${n-1}${t}`)]);
        if(has(n-1)&&has(n+1)) res.push([new Tile(`${n-1}${t}`), new Tile(`${n+1}${t}`)]);
        if(has(n+1)&&has(n+2)) res.push([new Tile(`${n+1}${t}`), new Tile(`${n+2}${t}`)]);
        return res;
    }
    static countDora(h, ds) { let c=0; h.forEach(t=>{ds.forEach(d=>{if(this.isNext(d,t))c++;})}); return c; }
    static isNext(d, t) {
        if(d.type!==t.type) return false;
        if(d.type==='z') { const o=[1,2,3,4,1,5,6,7,5]; const i=o.indexOf(d.num); return i!==-1 && o[i+1]===t.num; }
        return (d.num%9+1)===t.num;
    }
}

class Player {
    constructor(id, isHuman) {
        this.id = id; this.isHuman = isHuman;
        this.hand = []; this.river = []; this.melds = [];
        this.score = 25000; this.resetRound();
    }
    resetRound() {
        this.hand = []; this.river = []; this.melds = [];
        this.isRiichi = false; this.isDoubleRiichi = false; this.isIppatsu = false;
        this.firstTurn = true; this.declareRiichi = false;
    }
    addTile(t) { this.hand.push(t); this.sortHand(); }
    removeTileByIndex(i) { return this.hand.splice(i, 1)[0]; }
    sortHand() { this.hand.sort((a,b)=>a.value - b.value); }
    get isMenzen() { return this.melds.length === 0; }
    count(id) { return this.hand.filter(t=>t.id===id).length; }
    thinkDiscard() {
        if(this.isRiichi) return this.hand.length-1;
        let idx = this.hand.findIndex(t=>t.type==='z' && this.count(t.id)===1);
        if(idx===-1) idx = this.hand.findIndex(t=>t.isYaochu && this.count(t.id)===1);
        return idx===-1 ? Math.floor(Math.random()*this.hand.length) : idx;
    }
}

class Game {
    constructor() {
        this.players = []; this.wall = []; this.doraMarkers = [];
        this.turn = 0; this.state = 'INIT'; this.activeTile = null;
        this.context = {};
    }

    // ゲーム開始ボタンから呼ばれる
    init() {
        // ボタンリセット (ここが修正ポイント)
        this.hideButtons();
        document.getElementById('result-modal').classList.add('hidden');
        document.getElementById('title-screen').classList.add('hidden');

        this.wall = [];
        ['m', 'p', 's'].forEach(t => { for(let i=1;i<=9;i++) for(let k=0;k<4;k++) this.wall.push(new Tile(`${i}${t}`)); });
        ['z'].forEach(t => { for(let i=1;i<=7;i++) for(let k=0;k<4;k++) this.wall.push(new Tile(`${i}${t}`)); });
        this.shuffle(this.wall);

        this.players = [0,1,2,3].map(i => new Player(i, i===0));
        this.doraMarkers = [this.wall[5]];
        
        for(let i=0; i<13; i++) this.players.forEach(p => p.addTile(this.wall.pop()));

        this.turn = 0;
        this.context = { parent: 0, bakaze: '1z' };
        
        this.renderAll();
        this.updateMsg("対局開始");
        setTimeout(() => this.startTurn(), 1000);
    }

    shuffle(a) { for(let i=a.length-1; i>0; i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

    startTurn() {
        this.hideButtons(); // ターン開始時に確実に隠す
        if (this.wall.length === 0) return this.finishGame("流局", { yaku: [] }, 0);

        this.state = 'DRAW';
        this.context.isRinshan = false; 
        this.updateInfo();
        this.highlightActivePlayer();

        const p = this.players[this.turn];
        const tile = this.wall.pop();
        p.addTile(tile);
        this.renderHand(this.turn);

        // 天和・地和判定
        const isTenho = (p.firstTurn && this.turn===0 && this.wall.length > 70); 

        if (p.isHuman) {
            const ctx = { ...this.context, isTsumo: true, isRiichi: p.isRiichi, isDoubleRiichi: p.isDoubleRiichi, isIppatsu: p.isIppatsu, isMenzen: p.isMenzen, isTenho, isHaitei: this.wall.length===0 };
            const res = Checker.solve(p.hand, p.melds, tile, ctx, this.doraMarkers);
            
            // 天和等の即アガリ以外では、即座にボタンを表示しないように見えるが、
            // ロジック上は「引いてすぐアガれるか」確認し、Yesならボタンを出すのが正しい。
            // もし「何もしていないのにボタンが出る」原因が天和でないなら、前のターンのボタンが残っていた可能性が高い。
            // 先頭の hideButtons() でそれは解消されるはず。
            if (res.canWin) this.showButton('btn-tsumo');
            
            if (!p.isRiichi && p.isMenzen && Checker.checkTenpai(p.hand)) this.showButton('btn-riichi');
            if (Checker.canKan(p.hand)) this.showButton('btn-kan');
        } else {
            const ctx = { ...this.context, isTsumo: true, isMenzen: p.isMenzen, isRiichi: p.isRiichi };
            const res = Checker.solve(p.hand, p.melds, tile, ctx, this.doraMarkers);
            if (res.canWin) return this.finishGame("TSUMO", res, this.turn);
        }

        if (p.isRiichi) setTimeout(() => this.discard(this.turn, p.hand.length-1), 800);
        else if (!p.isHuman) setTimeout(() => this.discard(this.turn, p.thinkDiscard()), 600);
    }

    discard(pIdx, tileIdx) {
        this.hideButtons();
        const p = this.players[pIdx];
        const tile = p.removeTileByIndex(tileIdx);
        if (!p.isHuman || p.isRiichi) p.sortHand();
        p.river.push(tile);
        this.activeTile = { tile, from: pIdx };
        this.renderAll();
        this.players.forEach(pl => pl.isIppatsu = false);

        if (p.declareRiichi) {
            p.isRiichi = true;
            if (p.firstTurn) p.isDoubleRiichi = true;
            p.isIppatsu = true; p.declareRiichi = false; p.score -= 1000;
            this.renderScores();
            document.querySelector(`#p${pIdx} .riichi-stick`).style.display = 'block';
        }
        p.firstTurn = false;
        this.checkNaki(pIdx, tile);
    }

    checkNaki(fromIdx, tile) {
        this.state = 'NAKI_CHECK';
        const human = this.players[0];
        if (fromIdx === 0) { setTimeout(() => this.nextTurn(), 200); return; }

        const ctx = { ...this.context, isTsumo: false, isMenzen: human.isMenzen, isRiichi: human.isRiichi, isIppatsu: human.isIppatsu, isHoutei: this.wall.length===0 };
        const res = Checker.solve([...human.hand, tile], human.melds, tile, ctx, this.doraMarkers);
        
        let can = false;
        if (res.canWin) { this.showButton('btn-ron'); can = true; }
        if (!human.isRiichi) { // リーチ時は鳴けない
            if (human.count(tile.id) >= 2) { this.showButton('btn-pon'); can = true; }
            if (human.count(tile.id) === 3) { this.showButton('btn-kan'); can = true; }
            if (fromIdx === 3 && tile.type !== 'z' && Checker.canChi(human.hand, tile)) { this.showButton('btn-chi'); can = true; }
        }

        if (can) this.showButton('btn-pass');
        else setTimeout(() => this.nextTurn(), 200);
    }

    nextTurn() { this.turn = (this.turn+1)%4; this.startTurn(); }
    humanAction(act) {
        const p = this.players[0];
        const t = this.activeTile ? this.activeTile.tile : null;
        if (act === 'ron') {
            const ctx = { ...this.context, isTsumo: false, isMenzen: p.isMenzen, isRiichi: p.isRiichi, isDoubleRiichi: p.isDoubleRiichi, isIppatsu: p.isIppatsu, isHoutei: this.wall.length===0, parent: 0 };
            const res = Checker.solve([...p.hand, t], p.melds, t, ctx, this.doraMarkers);
            this.finishGame("RON", res, 0);
        } else if (act === 'tsumo') {
            const last = p.hand[p.hand.length - 1];
            const ctx = { ...this.context, isTsumo: true, isMenzen: p.isMenzen, isRiichi: p.isRiichi, isDoubleRiichi: p.isDoubleRiichi, isIppatsu: p.isIppatsu, isHaitei: this.wall.length===0, isRinshan: this.context.isRinshan, parent: 0 };
            const res = Checker.solve(p.hand, p.melds, last, ctx, this.doraMarkers);
            this.finishGame("TSUMO", res, 0);
        } else if (act === 'riichi') {
            p.declareRiichi = true; this.updateMsg("リーチ：牌を捨ててください"); this.hideButtons();
        } else if (act === 'pon' || act === 'chi' || act === 'kan') {
            this.performMeld(act);
        } else if (act === 'pass') {
            this.hideButtons(); this.nextTurn();
        }
    }
    performMeld(type) {
        this.hideButtons(); const p = this.players[0]; const t = this.activeTile.tile; let consumed = [];
        this.players.forEach(pl => pl.isIppatsu = false);
        if (type === 'pon' || type === 'kan') {
            const c = type === 'pon' ? 2 : 3;
            for(let i=0;i<c;i++) consumed.push(p.hand.splice(p.hand.findIndex(x=>x.id===t.id),1)[0]);
        } else if (type === 'chi') {
            const cand = Checker.getChiCandidates(p.hand, t)[0];
            consumed.push(p.hand.splice(p.hand.findIndex(x=>x.id===cand[0].id),1)[0]);
            consumed.push(p.hand.splice(p.hand.findIndex(x=>x.id===cand[1].id),1)[0]);
        }
        if (type === 'kan') {
            p.melds.push({ type: 'kan', tiles: [...consumed, t], from: this.activeTile.from });
            this.players[this.activeTile.from].river.pop();
            this.turn = 0; this.context.isRinshan = true;
            p.addTile(this.wall.pop()); this.renderAll();
            setTimeout(() => this.discard(0, p.hand.length-1), 500); return;
        }
        p.melds.push({ type, tiles: [...consumed, t], from: this.activeTile.from });
        this.players[this.activeTile.from].river.pop();
        this.turn = 0; this.renderAll(); this.updateMsg("牌を捨ててください");
    }
    finishGame(type, res, winner) {
        const modal = document.getElementById('result-modal');
        document.getElementById('res-title').innerText = type;
        const list = document.getElementById('res-yaku-list'); list.innerHTML = "";
        if (!res.yaku || res.yaku.length === 0) { document.getElementById('res-score').innerText = "流局"; }
        else {
            res.yaku.forEach(y => { const d=document.createElement('div'); d.className='yaku-item'; d.innerHTML=`<span>${y}</span>`; list.appendChild(d); });
            const scoreEl = document.getElementById('res-score');
            const det = res.title ? `(${res.title})` : "";
            scoreEl.innerHTML = `<div style="font-size:0.6em;color:#ccc;margin-bottom:5px;">${res.fu}符 ${res.han}翻 ${det}</div>${res.score} 点<div style="font-size:0.5em;margin-top:5px;">(${res.text})</div>`;
        }
        modal.classList.remove('hidden');
    }
    renderAll() { this.players.forEach(p => { this.renderHand(p.id); this.renderRiver(p.id); }); this.updateInfo(); }
    renderScores() { /* 点数表示用 */ }
    renderHand(pid) {
        const p = this.players[pid];
        const div = pid === 0 ? document.getElementById('my-hand') : document.querySelector(`#p${pid} .hand-wrapper`);
        const mDiv = pid === 0 ? document.getElementById('my-melds') : null;
        div.innerHTML = "";
        p.hand.forEach((t, i) => {
            const d = document.createElement('div'); d.className = pid === 0 ? "tile" : "tile back";
            if (pid === 0) { d.innerText = t.char; d.dataset.type = t.type; d.dataset.id = t.id; d.onclick = () => this.onTileClick(i); }
            if (i === p.hand.length - 1 && this.state === 'DRAW' && this.turn === pid) d.style.marginLeft = "10px";
            div.appendChild(d);
        });
        if (mDiv) {
            mDiv.innerHTML = "";
            p.melds.forEach(m => {
                const g = document.createElement('div'); g.className = 'meld-group';
                m.tiles.forEach(t => { const x = document.createElement('div'); x.className = 'tile'; x.innerText = t.char; x.dataset.type = t.type; g.appendChild(x); });
                mDiv.appendChild(g);
            });
        }
    }
    renderRiver(pid) { const d=document.querySelector(`#p${pid} .river`); d.innerHTML=""; this.players[pid].river.forEach(t=>{const e=document.createElement('div');e.className='tile';e.innerText=t.char;e.dataset.type=t.type;d.appendChild(e);}); }
    updateInfo() {
        document.getElementById('wall-count').innerText = this.wall.length;
        const d = this.doraMarkers[0]; const di = document.getElementById('dora-indicator');
        di.className = 'tile'; di.innerText = d.char; di.dataset.type = d.type;
        [0,1,2,3].forEach(i => { const s=document.querySelector(`#p${i} .riichi-stick`); if(s)s.style.display=this.players[i].isRiichi?'block':'none'; });
    }
    updateMsg(t) { document.getElementById('notification-area').innerText = t; }
    highlightActivePlayer() { document.querySelectorAll('.player-area').forEach(e => e.classList.remove('active-turn')); document.getElementById(`p${this.turn}`).classList.add('active-turn'); }
    showButton(id) { document.getElementById(id).hidden = false; document.getElementById(id).style.display = 'inline-block'; }
    hideButtons() { document.querySelectorAll('.act-btn').forEach(b => { b.hidden = true; b.style.display = 'none'; }); }
    onTileClick(i) { if (this.turn === 0 && this.state === 'DRAW' && !this.players[0].isRiichi) this.discard(0, i); }
}

const game = new Game();
// window.onload で即開始せず、ボタンクリックを待つ
document.getElementById('btn-start').onclick = () => game.init();
document.getElementById('btn-chi').onclick = () => game.humanAction('chi');
document.getElementById('btn-pon').onclick = () => game.humanAction('pon');
document.getElementById('btn-kan').onclick = () => game.humanAction('kan');
document.getElementById('btn-riichi').onclick = () => game.humanAction('riichi');
document.getElementById('btn-ron').onclick = () => game.humanAction('ron');
document.getElementById('btn-tsumo').onclick = () => game.humanAction('tsumo');
document.getElementById('btn-pass').onclick = () => game.humanAction('pass');
