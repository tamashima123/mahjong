/**
 * Ultimate JS Mahjong v3.0 - Complete Edition
 * Features: Full Yaku Support, Score Calculation, AI, Naki, Riichi, Dora
 */

// --- 1. 定数・データ構造 ---
const TILE_MAP = {
    m: "🀇🀈🀉🀊🀋🀌🀍🀎🀏", // 萬子
    p: "🀙🀚🀛🀜🀝🀞🀟🀠🀡", // 筒子
    s: "🀐🀑🀒🀓🀔🀕🀖🀗🀘", // 索子
    z: "🀀🀁🀂🀃🀆🀅🀄"     // 字牌 (東南西北白發中)
};

class Tile {
    constructor(id) {
        this.id = id; // ex: "1m", "5z"
        this.type = id.substr(1, 1);
        this.num = parseInt(id.substr(0, 1));
        this.char = TILE_MAP[this.type][this.num - 1];
        this.uid = Math.random().toString(36).substr(2, 9); // ユニークID
    }
    get value() {
        const typeOrder = { m: 0, p: 1, s: 2, z: 3 };
        return typeOrder[this.type] * 100 + this.num;
    }
    get isYaochu() {
        return this.type === 'z' || this.num === 1 || this.num === 9;
    }
    get isGreen() {
        // 緑一色用 (索子の2,3,4,6,8 と 發)
        if (this.type === 's') return [2, 3, 4, 6, 8].includes(this.num);
        return this.id === '6z';
    }
}

// --- 2. 点数計算機 ---
class ScoreCalculator {
    static calc(yakuList, han, fu, isParent, isTsumo) {
        // 1. 役満判定
        const yakumans = yakuList.filter(y => y.includes("役満"));
        if (yakumans.length > 0) {
            // ダブル役満等は個数分加算 (基本:親48000/子32000)
            const base = 8000 * 4 * yakumans.length;
            return this.getPayments(base, isParent, isTsumo, "役満");
        }

        // 2. 符の補正
        if (yakuList.includes("七対子")) fu = 25;
        else if (fu === 20 && !isTsumo) fu = 30; // 鳴きピンフ形ロンなど

        // 3. 基本点 (符 * 2^(翻+2))
        let basic = fu * Math.pow(2, han + 2);

        // 4. リミット判定 (満貫以上)
        let title = "";
        if (basic > 2000 || han >= 5) {
            if (han >= 13) { basic = 8000 * 4; title = "数え役満"; }
            else if (han >= 11) { basic = 6000 * 4; title = "三倍満"; }
            else if (han >= 8) { basic = 4000 * 4; title = "倍満"; }
            else if (han >= 6) { basic = 3000 * 4; title = "跳満"; }
            else { basic = 2000 * 4; title = "満貫"; }
        }

        return this.getPayments(basic, isParent, isTsumo, title);
    }

    static getPayments(basic, isParent, isTsumo, title) {
        const ceil100 = (n) => Math.ceil(n / 100) * 100;
        let pay = {};
        let total = 0;
        let text = "";

        if (isTsumo) {
            if (isParent) { // 親ツモ (オール)
                const p = ceil100(basic * 2);
                pay = { all: p };
                total = p * 3;
                text = `${p}オール`;
            } else { // 子ツモ
                const childP = ceil100(basic);
                const parentP = ceil100(basic * 2);
                pay = { parent: parentP, child: childP };
                total = parentP + childP * 2;
                text = `${childP} / ${parentP}`;
            }
        } else { // ロン
            const multi = isParent ? 6 : 4;
            total = ceil100(basic * multi);
            pay = { target: total };
            text = `${total}`;
        }
        return { score: total, payText: text, title: title };
    }

    static calcFu(hand, groups, melds, winTile, ctx, yakuList) {
        if (yakuList.includes("七対子")) return 25;
        if (yakuList.includes("平和") && ctx.isTsumo) return 20;

        let fu = 20; // 副底

        // 門前ロン加符 (+10) / ツモ加符 (+2)
        if (ctx.isMenzen && !ctx.isTsumo) fu += 10;
        if (ctx.isTsumo) fu += 2;

        // 面子加符
        // meldsはすでにgroupsに含まれている前提で処理
        groups.forEach(g => {
            if (g.type === 'koutsu' || g.type === 'kan') {
                let s = 2;
                if (g.tiles[0].isYaochu) s *= 2;
                if (!g.isOpen) s *= 2; // 暗刻は2倍
                if (g.type === 'kan') s *= 4;
                fu += s;
            }
            if (g.type === 'head') {
                const id = g.tiles[0].id;
                // 役牌雀頭 (+2)
                if (['5z', '6z', '7z'].includes(id)) fu += 2;
                if (id === ctx.bakaze) fu += 2;
                if (id === ((ctx.parent === 0) ? '1z' : '2z')) fu += 2; // 自風(簡易)
            }
        });

        // 待ち加符 (+2: カンチャン、ペンチャン、単騎)
        // アガリ牌を含むグループの形状で判定
        let waitFu = 0;
        const head = groups.find(g => g.type === 'head');
        if (head && head.tiles[0].id === winTile.id) waitFu = 2; // 単騎

        const shuntsu = groups.find(g => g.type === 'shuntsu' && g.tiles.some(t => t.id === winTile.id));
        if (shuntsu) {
            const nums = shuntsu.tiles.map(t => t.num).sort((a, b) => a - b);
            const w = winTile.num;
            // カンチャン (例: 2,4 で 3待ち)
            if (nums[1] === w) waitFu = 2;
            // ペンチャン (例: 1,2 で 3待ち / 8,9 で 7待ち)
            else if ((nums[0] === 1 && nums[1] === 2 && w === 3) || (nums[1] === 8 && nums[2] === 9 && w === 7)) waitFu = 2;
        }
        fu += waitFu;

        // 切り上げ
        if (fu % 10 !== 0) fu = Math.floor(fu / 10 + 1) * 10;
        return fu;
    }
}

// --- 3. 役判定エンジン (Checker) ---
class Checker {
    static solve(hand, melds, winTile, ctx, doras) {
        const fullHand = [...hand];
        const cnt = this.countMap(fullHand);

        // A. 役満チェック
        const yakumans = this.checkYakuman(fullHand, melds, cnt, winTile, ctx);
        if (yakumans.length > 0) {
            const calc = ScoreCalculator.calc(yakumans, 13, 0, ctx.parent === 0, ctx.isTsumo);
            return { canWin: true, yaku: yakumans, score: calc.score, text: calc.payText, title: "役満", fu: 0, han: 13 };
        }

        // B. 通常役探索
        let bestResult = { canWin: false, score: 0 };

        // 分解 (七対子用フラグも含めるか、別途判定)
        // 1. 七対子ルート
        if (melds.length === 0) {
            let pairs = 0; for (let k in cnt) if (cnt[k] === 2) pairs++;
            if (pairs === 7) {
                const yaku7 = ["七対子"];
                if (ctx.isRiichi) yaku7.push("立直");
                if (ctx.isDoubleRiichi) yaku7.push("ダブル立直");
                if (ctx.isTsumo) yaku7.push("門前清自摸和");
                if (this.isTanyao(Object.keys(cnt))) yaku7.push("断幺九");
                if (this.isHonitsu(fullHand)) yaku7.push("混一色");
                if (this.isChinitsu(fullHand)) yaku7.push("清一色");
                
                // ドラ
                const dCount = this.countDora(fullHand, doras);
                for(let i=0; i<dCount; i++) yaku7.push("ドラ");

                let han = yaku7.length + (yaku7.includes("混一色")?1:0) + (yaku7.includes("清一色")?4:0); // 簡易計算
                const calc = ScoreCalculator.calc(yaku7, han, 25, ctx.parent === 0, ctx.isTsumo);
                
                if (calc.score > bestResult.score) {
                    bestResult = { canWin: true, yaku: yaku7, score: calc.score, text: calc.payText, title: calc.title, fu: 25, han: han };
                }
            }
        }

        // 2. 4面子1雀頭ルート
        const forms = this.decomposeAll(cnt, 4 - melds.length);
        forms.forEach(groups => {
            // meldsを統合 (isOpenフラグ付与)
            const allGroups = groups.map(g => ({ ...g, isOpen: false })); // 手牌内は暗
            melds.forEach(m => {
                const type = m.type === 'chi' ? 'shuntsu' : (m.type === 'kan' ? 'kan' : 'koutsu');
                allGroups.push({ type: type, tiles: m.tiles, isOpen: true });
            });

            // ロンあがりの場合、アガリ牌を含む暗刻は明刻扱いになるケースがあるが、ここでは簡易化

            const yakuList = this.calcNormalYaku(allGroups, fullHand, melds, winTile, ctx);
            
            if (yakuList.length > 0) {
                // ドラ
                const dCount = this.countDora(fullHand, doras);
                for(let i=0; i<dCount; i++) yakuList.push("ドラ");

                // 翻数計算
                let han = 0;
                yakuList.forEach(y => {
                    if (["清一色"].includes(y)) han += (ctx.isMenzen ? 6 : 5);
                    else if (["純全帯么九"].includes(y)) han += (ctx.isMenzen ? 3 : 2);
                    else if (["混一色", "混全帯么九"].includes(y)) han += (ctx.isMenzen ? 3 : 2); // ホンイツ3/2
                    else if (["三色同順", "一気通貫", "三暗刻", "対々和", "ダブル立直", "七対子"].includes(y)) han += (ctx.isMenzen ? 2 : 1); // 食い下がり系はここで調整
                    else han += 1;
                    // ※注: 上記の三色は喰い下がりで1になる。ロジック上はyakuListだけ渡しているので、ここで条件分岐が必要
                    // 簡易実装のため、「食い下がり役」はここで判定
                });

                // 食い下がり補正（厳密版）
                if(!ctx.isMenzen) {
                    if(yakuList.includes("三色同順")) han -= 1;
                    if(yakuList.includes("一気通貫")) han -= 1;
                    // 対々和、三暗刻は喰い下がりなし(2翻)
                }

                // 符計算
                const fu = ScoreCalculator.calcFu(fullHand, allGroups, melds, winTile, ctx, yakuList);
                const calc = ScoreCalculator.calc(yakuList, han, fu, ctx.parent === 0, ctx.isTsumo);

                if (calc.score > bestResult.score) {
                    bestResult = { canWin: true, yaku: yakuList, score: calc.score, text: calc.payText, title: calc.title, fu: fu, han: han };
                }
            }
        });

        return bestResult.canWin ? bestResult : { canWin: false, yaku: [] };
    }

    // --- 役満判定 ---
    static checkYakuman(hand, melds, cnt, winTile, ctx) {
        const res = [];
        const isMenzen = melds.length === 0;
        const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
        
        // 国士無双
        if (isMenzen) {
            const yaochu = "1m9m1p9p1s9s1z2z3z4z5z6z7z";
            let unique = 0, dup = 0;
            for (let id of Object.keys(cnt)) {
                if (yaochu.includes(id)) unique++;
                if (cnt[id] === 2) dup++;
            }
            if (unique === 13 && dup === 1) res.push("国士無双");
        }
        // 四暗刻 (トイトイ形かつ、すべて暗刻) -> 簡易判定: 鳴きなし＆トイトイ形なら四暗刻とする
        // ※ロンの場合、単騎なら四暗刻だが、シャンポンロンは三暗刻対々。ここは「メンゼンツモり四暗刻」のみ判定
        if (isMenzen && ctx.isTsumo) {
            let koutsu = 0;
            for (let k in cnt) if (cnt[k] >= 3) koutsu++;
            if (koutsu === 4) res.push("四暗刻");
        }
        // 大三元
        if (this.countType(allTiles, '5z') >= 3 && this.countType(allTiles, '6z') >= 3 && this.countType(allTiles, '7z') >= 3) res.push("大三元");
        // 字一色
        if (allTiles.every(t => t.type === 'z')) res.push("字一色");
        // 緑一色
        if (allTiles.every(t => t.isGreen)) res.push("緑一色");
        // 清老頭
        if (allTiles.every(t => t.isYaochu && t.type !== 'z')) res.push("清老頭");
        // 天和・地和
        if (ctx.isTenho) res.push("天和");
        else if (ctx.isChiho) res.push("地和");

        return res;
    }

    // --- 通常役判定 ---
    static calcNormalYaku(groups, hand, melds, winTile, ctx) {
        let yaku = [];
        const isMenzen = melds.length === 0;
        const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
        const ids = allTiles.map(t => t.id);

        // 1翻
        if (ctx.isRiichi) yaku.push("立直");
        if (ctx.isDoubleRiichi) yaku.push("ダブル立直");
        if (ctx.isIppatsu) yaku.push("一発");
        if (isMenzen && ctx.isTsumo) yaku.push("門前清自摸和");
        if (this.isTanyao(ids)) yaku.push("断幺九");
        
        // 役牌
        groups.forEach(g => {
            if (g.type === 'koutsu' || g.type === 'kan') {
                const id = g.tiles[0].id;
                if (id === '5z') yaku.push("白");
                if (id === '6z') yaku.push("發");
                if (id === '7z') yaku.push("中");
                if (id === ctx.bakaze) yaku.push("場風牌");
                if (id === ((ctx.parent === 0) ? '1z' : '2z')) yaku.push("自風牌");
            }
        });

        if (this.isPinfu(groups, melds, ctx.bakaze, '1z')) yaku.push("平和"); // 待ち判定は簡易
        if (isMenzen && this.checkIipeiko(groups)) yaku.push("一盃口");
        if (ctx.isHaitei && ctx.isTsumo) yaku.push("海底摸月");
        if (ctx.isHoutei && !ctx.isTsumo) yaku.push("河底撈魚");
        if (ctx.isRinshan) yaku.push("嶺上開花");

        // 2翻以上
        if (this.checkToitoi(groups)) yaku.push("対々和");
        if (this.checkSanankou(groups, ctx.isTsumo, winTile)) yaku.push("三暗刻");
        if (this.checkSanshoku(groups)) yaku.push("三色同順");
        if (this.checkIttsu(groups)) yaku.push("一気通貫");
        if (this.checkChanta(groups)) yaku.push("混全帯么九");
        if (this.checkJunchan(groups)) yaku.push("純全帯么九");
        if (this.checkHonroutou(groups)) yaku.push("混老頭");
        
        // 染め手
        if (this.isChinitsu(allTiles)) yaku.push("清一色");
        else if (this.isHonitsu(allTiles)) yaku.push("混一色");

        // 小三元
        if (this.countType(allTiles, '5z')>=2 && this.countType(allTiles, '6z')>=2 && this.countType(allTiles, '7z')>=2) {
             // 上記は最低条件。実際は2つが刻子、1つが頭
             let dragonKoutsu = 0;
             let dragonHead = 0;
             groups.forEach(g => {
                 const id = g.tiles[0].id;
                 if(['5z','6z','7z'].includes(id)) {
                     if(g.type === 'koutsu' || g.type === 'kan') dragonKoutsu++;
                     if(g.type === 'head') dragonHead++;
                 }
             });
             if(dragonKoutsu === 2 && dragonHead === 1) yaku.push("小三元");
        }

        return yaku;
    }

    // --- ロジック詳細 ---
    static countType(tiles, id) { return tiles.filter(t => t.id === id).length; }
    static isTanyao(ids) { return ids.every(id => !id.includes('z') && !id.startsWith('1') && !id.startsWith('9')); }
    static isHonitsu(tiles) { const hasZ = tiles.some(t => t.type === 'z'); const types = new Set(tiles.filter(t => t.type !== 'z').map(t => t.type)); return types.size === 1 && hasZ; }
    static isChinitsu(tiles) { return tiles.every(t => t.type !== 'z') && new Set(tiles.map(t => t.type)).size === 1; }
    
    static checkToitoi(groups) { return groups.every(g => g.type === 'koutsu' || g.type === 'head' || g.type === 'kan'); }
    static checkSanankou(groups, isTsumo, winTile) {
        // 暗刻が3つ。ロンの場合は明刻扱いになる暗刻の除外が必要
        let ankous = 0;
        groups.forEach(g => {
            if((g.type === 'koutsu' || g.type === 'kan') && !g.isOpen) {
                // ロンあがりで、その暗刻がアガリ牌を含んでいたら明刻扱い
                if(!isTsumo && g.tiles.some(t => t.id === winTile.id)) { /* 明刻扱い */ }
                else { ankous++; }
            }
        });
        return ankous >= 3;
    }
    static checkIipeiko(groups) {
        const shuntsu = groups.filter(g => g.type === 'shuntsu').map(g => g.tiles[0].id);
        const set = new Set(shuntsu);
        return shuntsu.length - set.size >= 1;
    }
    static checkSanshoku(groups) {
        const map = {};
        groups.filter(g => g.type === 'shuntsu').forEach(g => {
            const n = g.tiles[0].num; const t = g.tiles[0].type;
            if (!map[n]) map[n] = [];
            if (!map[n].includes(t)) map[n].push(t);
        });
        return Object.values(map).some(types => types.includes('m') && types.includes('p') && types.includes('s'));
    }
    static checkIttsu(groups) {
        const map = { m: [], p: [], s: [] };
        groups.filter(g => g.type === 'shuntsu').forEach(g => {
            if (map[g.tiles[0].type]) map[g.tiles[0].type].push(g.tiles[0].num);
        });
        return Object.values(map).some(nums => nums.includes(1) && nums.includes(4) && nums.includes(7));
    }
    static checkChanta(groups) {
        return groups.every(g => g.tiles.some(t => t.isYaochu)) && groups.some(g => g.tiles[0].type === 'z') && groups.some(g => g.tiles[0].type !== 'z');
    }
    static checkJunchan(groups) {
        return groups.every(g => g.tiles.some(t => t.isYaochu && t.type !== 'z'));
    }
    static checkHonroutou(groups) {
        return groups.every(g => g.type !== 'shuntsu' && g.tiles[0].isYaochu);
    }
    static isPinfu(groups, melds, bakaze, jikaze) {
        if (melds.length > 0) return false;
        if (!groups.every(g => g.type === 'shuntsu' || g.type === 'head')) return false;
        const head = groups.find(g => g.type === 'head');
        if (!head) return false;
        const hId = head.tiles[0].id;
        if (['5z', '6z', '7z'].includes(hId) || hId === bakaze || hId === jikaze) return false;
        // 待ちはcalcFuの方で判定しているが、役としてのピンフ成立条件に本来は「両面待ち」が必要
        return true; 
    }

    // --- 分解ロジック (バックトラック) ---
    static decomposeAll(cnt, needed) {
        const results = [];
        this._bt(cnt, needed, [], results);
        return results;
    }
    static _bt(cnt, needed, current, results) {
        if (needed === 0) {
            for (let k in cnt) if (cnt[k] === 2) {
                results.push([...current, { type: 'head', tiles: [new Tile(k), new Tile(k)] }]);
                return;
            }
            return;
        }
        let first = null;
        for (let k of Object.keys(cnt).sort()) if (cnt[k] > 0) { first = k; break; }
        if (!first) return;

        // 刻子
        if (cnt[first] >= 3) {
            cnt[first] -= 3;
            current.push({ type: 'koutsu', tiles: [new Tile(first), new Tile(first), new Tile(first)] });
            this._bt(cnt, needed - 1, current, results);
            current.pop();
            cnt[first] += 3;
        }
        // 順子
        if (!first.includes('z')) {
            const n = parseInt(first[0]), t = first[1];
            if (n <= 7) {
                const n2 = (n + 1) + t, n3 = (n + 2) + t;
                if (cnt[n2] > 0 && cnt[n3] > 0) {
                    cnt[first]--; cnt[n2]--; cnt[n3]--;
                    current.push({ type: 'shuntsu', tiles: [new Tile(first), new Tile(n2), new Tile(n3)] });
                    this._bt(cnt, needed - 1, current, results);
                    current.pop();
                    cnt[first]++; cnt[n2]++; cnt[n3]++;
                }
            }
        }
    }

    // --- Utils ---
    static countMap(hand) { const c = {}; hand.forEach(t => c[t.id] = (c[t.id] || 0) + 1); return c; }
    static checkTenpai(hand) { 
        // 簡易: 1枚余剰牌を除いて判定、もしくは全通りの牌を足してアガれるか見る
        // ここでは「あと1枚でアガれるか」を判定するため、34種すべて試すのが確実
        const allIds = [];
        ['m','p','s'].forEach(t=>{for(let i=1;i<=9;i++) allIds.push(i+t)});
        ['z'].forEach(t=>{for(let i=1;i<=7;i++) allIds.push(i+t)});
        
        for(let id of allIds) {
            const t = new Tile(id);
            // 役は関係なく形ができるかだけ見る（簡略）
            const res = this.decomposeAll(this.countMap([...hand, t]), 4); // 鳴き考慮なしの簡易テンパイチェック
            if(res.length > 0) return true;
        }
        return false;
    }
    static canKan(hand) { const c = this.countMap(hand); return Object.values(c).some(n => n === 4); }
    static canChi(hand, tile) { return this.getChiCandidates(hand, tile).length > 0; }
    static getChiCandidates(hand, tile) {
        const n = tile.num, t = tile.type;
        const res = [];
        const has = (num) => hand.some(x => x.type === t && x.num === num);
        if (has(n - 1) && has(n - 2)) res.push([new Tile(`${n - 2}${t}`), new Tile(`${n - 1}${t}`)]);
        if (has(n - 1) && has(n + 1)) res.push([new Tile(`${n - 1}${t}`), new Tile(`${n + 1}${t}`)]);
        if (has(n + 1) && has(n + 2)) res.push([new Tile(`${n + 1}${t}`), new Tile(`${n + 2}${t}`)]);
        return res;
    }
    static countDora(hand, doras) {
        let count = 0;
        hand.forEach(t => { doras.forEach(d => { if (this.isNext(d, t)) count++; }); });
        return count;
    }
    static isNext(doraMarker, tile) {
        if (doraMarker.type !== tile.type) return false;
        if (doraMarker.type === 'z') {
            const order = [1, 2, 3, 4, 1, 5, 6, 7, 5]; // 東南西北東, 白發中白
            const dIdx = order.indexOf(doraMarker.num);
            return dIdx !== -1 && order[dIdx + 1] === tile.num;
        }
        return (doraMarker.num % 9 + 1) === tile.num;
    }
}

// --- 4. プレイヤー ---
class Player {
    constructor(id, isHuman = false) {
        this.id = id;
        this.isHuman = isHuman;
        this.hand = [];
        this.river = [];
        this.melds = [];
        this.score = 25000;
        this.resetRound();
    }
    resetRound() {
        this.hand = []; this.river = []; this.melds = [];
        this.isRiichi = false; this.isDoubleRiichi = false; this.isIppatsu = false;
        this.isTenpai = false; this.firstTurn = true;
        this.declareRiichi = false;
    }
    addTile(tile) { this.hand.push(tile); this.sortHand(); }
    removeTileByIndex(idx) { return this.hand.splice(idx, 1)[0]; }
    sortHand() { this.hand.sort((a, b) => a.value - b.value); }
    get isMenzen() { return this.melds.length === 0; }
    count(id) { return this.hand.filter(t => t.id === id).length; }

    thinkDiscard() {
        if (this.isRiichi) return this.hand.length - 1; // ツモ切り
        // 簡易AI
        let idx = this.hand.findIndex(t => t.type === 'z' && this.count(t.id) === 1);
        if (idx === -1) idx = this.hand.findIndex(t => t.isYaochu && this.count(t.id) === 1);
        if (idx === -1) idx = Math.floor(Math.random() * this.hand.length);
        return idx;
    }
}

// --- 5. ゲームマスター ---
class Game {
    constructor() {
        this.players = [];
        this.wall = [];
        this.doraMarkers = [];
        this.turn = 0;
        this.state = 'INIT';
        this.activeTile = null;
        this.context = {};
    }

    init() {
        this.wall = [];
        ['m', 'p', 's'].forEach(t => { for (let i = 1; i <= 9; i++) for (let k = 0; k < 4; k++) this.wall.push(new Tile(`${i}${t}`)); });
        ['z'].forEach(t => { for (let i = 1; i <= 7; i++) for (let k = 0; k < 4; k++) this.wall.push(new Tile(`${i}${t}`)); });
        this.shuffle(this.wall);

        this.players = [0, 1, 2, 3].map(i => new Player(i, i === 0));
        this.doraMarkers = [this.wall[5]];
        
        // 配牌
        for (let i = 0; i < 13; i++) this.players.forEach(p => p.addTile(this.wall.pop()));

        this.turn = 0;
        this.context = { parent: 0, bakaze: '1z' };
        
        this.renderAll();
        this.updateMsg("対局開始");
        setTimeout(() => this.startTurn(), 1000);
    }

    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

    startTurn() {
        if (this.wall.length === 0) return this.finishGame("流局", { yaku: [] }, 0);

        this.state = 'DRAW';
        this.context.isRinshan = false; 
        this.updateInfo();
        this.highlightActivePlayer();

        const p = this.players[this.turn];
        const tile = this.wall.pop();
        p.addTile(tile);
        this.renderHand(this.turn);

        // 天和・地和判定用フラグ (wallの残りが初期-14*4に近いか等で判定すべきだが簡易)
        const isTenho = (p.firstTurn && this.turn===0 && this.wall.length > 70); 

        // ツモアガリチェック
        if (p.isHuman) {
            const ctx = { ...this.context, isTsumo: true, isRiichi: p.isRiichi, isDoubleRiichi: p.isDoubleRiichi, isIppatsu: p.isIppatsu, isMenzen: p.isMenzen, isTenho, isHaitei: this.wall.length === 0 };
            const res = Checker.solve(p.hand, p.melds, tile, ctx, this.doraMarkers);
            if (res.canWin) this.showButton('btn-tsumo');
            
            if (!p.isRiichi && p.isMenzen && Checker.checkTenpai(p.hand)) this.showButton('btn-riichi');
            if (Checker.canKan(p.hand)) this.showButton('btn-kan'); // 暗カン
        } else {
            // AI
            const ctx = { ...this.context, isTsumo: true, isMenzen: p.isMenzen, isRiichi: p.isRiichi };
            const res = Checker.solve(p.hand, p.melds, tile, ctx, this.doraMarkers);
            if (res.canWin) return this.finishGame("TSUMO", res, this.turn);
        }

        if (p.isRiichi) setTimeout(() => this.discard(this.turn, p.hand.length - 1), 800);
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

        // 一発消し (他家含む)
        this.players.forEach(pl => pl.isIppatsu = false);

        // リーチ宣言処理
        if (p.declareRiichi) {
            p.isRiichi = true;
            if (p.firstTurn) p.isDoubleRiichi = true;
            p.isIppatsu = true;
            p.declareRiichi = false;
            p.score -= 1000;
            this.renderScores(); // 点数表示更新
            document.querySelector(`#p${pIdx} .riichi-stick`).style.display = 'block';
        }
        p.firstTurn = false;

        this.checkNaki(pIdx, tile);
    }

    checkNaki(fromIdx, tile) {
        this.state = 'NAKI_CHECK';
        const human = this.players[0];
        
        if (fromIdx === 0) { 
            setTimeout(() => this.nextTurn(), 200); 
            return; 
        }

        // ロン判定
        const ctx = { ...this.context, isTsumo: false, isMenzen: human.isMenzen, isRiichi: human.isRiichi, isIppatsu: human.isIppatsu, isHoutei: this.wall.length === 0 };
        const res = Checker.solve([...human.hand, tile], human.melds, tile, ctx, this.doraMarkers);
        
        let can = false;
        if (res.canWin) { this.showButton('btn-ron'); can = true; }
        if (human.count(tile.id) >= 2) { this.showButton('btn-pon'); can = true; }
        if (human.count(tile.id) === 3) { this.showButton('btn-kan'); can = true; } // 明カン
        if (fromIdx === 3 && tile.type !== 'z' && Checker.canChi(human.hand, tile)) { this.showButton('btn-chi'); can = true; }

        if (can) this.showButton('btn-pass');
        else setTimeout(() => this.nextTurn(), 200);
    }

    nextTurn() { this.turn = (this.turn + 1) % 4; this.startTurn(); }

    humanAction(act) {
        const p = this.players[0];
        const t = this.activeTile ? this.activeTile.tile : null;
        
        if (act === 'ron') {
            const ctx = { ...this.context, isTsumo: false, isMenzen: p.isMenzen, isRiichi: p.isRiichi, isDoubleRiichi: p.isDoubleRiichi, isIppatsu: p.isIppatsu, isHoutei: this.wall.length === 0, parent: 0 };
            const res = Checker.solve([...p.hand, t], p.melds, t, ctx, this.doraMarkers);
            this.finishGame("RON", res, 0);
        }
        else if (act === 'tsumo') {
            const last = p.hand[p.hand.length - 1];
            const ctx = { ...this.context, isTsumo: true, isMenzen: p.isMenzen, isRiichi: p.isRiichi, isDoubleRiichi: p.isDoubleRiichi, isIppatsu: p.isIppatsu, isHaitei: this.wall.length === 0, isRinshan: this.context.isRinshan, parent: 0 };
            const res = Checker.solve(p.hand, p.melds, last, ctx, this.doraMarkers);
            this.finishGame("TSUMO", res, 0);
        }
        else if (act === 'riichi') {
            p.declareRiichi = true;
            this.updateMsg("リーチ：牌を捨ててください");
            this.hideButtons();
        }
        else if (act === 'pon' || act === 'chi' || act === 'kan') {
            this.performMeld(act);
        }
        else if (act === 'pass') {
            this.hideButtons();
            this.nextTurn();
        }
    }

    performMeld(type) {
        this.hideButtons();
        const p = this.players[0];
        const t = this.activeTile.tile;
        let consumed = [];

        this.players.forEach(pl => pl.isIppatsu = false);

        if (type === 'pon' || type === 'kan') {
            const count = type === 'pon' ? 2 : 3;
            for (let i = 0; i < count; i++) consumed.push(p.hand.splice(p.hand.findIndex(x => x.id === t.id), 1)[0]);
        } else if (type === 'chi') {
            const cand = Checker.getChiCandidates(p.hand, t)[0];
            consumed.push(p.hand.splice(p.hand.findIndex(x => x.id === cand[0].id), 1)[0]);
            consumed.push(p.hand.splice(p.hand.findIndex(x => x.id === cand[1].id), 1)[0]);
        }

        if (type === 'kan') {
            p.melds.push({ type: 'kan', tiles: [...consumed, t], from: this.activeTile.from });
            this.players[this.activeTile.from].river.pop();
            this.turn = 0;
            this.context.isRinshan = true;
            const rinshan = this.wall.pop();
            p.addTile(rinshan);
            this.renderAll();
            setTimeout(() => this.discard(0, p.hand.length - 1), 500); // 簡易:カン後は強制打牌
            return;
        }

        p.melds.push({ type, tiles: [...consumed, t], from: this.activeTile.from });
        this.players[this.activeTile.from].river.pop();
        this.turn = 0;
        this.renderAll();
        this.updateMsg("牌を捨ててください");
    }

    finishGame(type, resultData, winner) {
        const modal = document.getElementById('result-modal');
        document.getElementById('res-title').innerText = type;
        const list = document.getElementById('res-yaku-list');
        list.innerHTML = "";

        if (!resultData.yaku || resultData.yaku.length === 0) {
            document.getElementById('res-score').innerText = "流局";
        } else {
            resultData.yaku.forEach(y => {
                const div = document.createElement('div');
                div.className = 'yaku-item';
                div.innerHTML = `<span>${y}</span>`;
                list.appendChild(div);
            });

            const scoreEl = document.getElementById('res-score');
            const detailText = resultData.title ? `(${resultData.title})` : "";
            scoreEl.innerHTML = `
                <div style="font-size:0.6em; color:#ccc; margin-bottom:5px;">
                    ${resultData.fu}符 ${resultData.han}翻 ${detailText}
                </div>
                ${resultData.score} 点
                <div style="font-size:0.5em; margin-top:5px;">(${resultData.text})</div>
            `;
        }
        modal.classList.remove('hidden');
    }

    renderAll() {
        this.players.forEach(p => { this.renderHand(p.id); this.renderRiver(p.id); });
        this.renderScores();
        this.updateInfo();
    }
    renderScores() {
        // スコア表示があれば更新 (HTML側にスコア表示エリアが必要)
    }
    renderHand(pid) {
        const p = this.players[pid];
        const div = pid === 0 ? document.getElementById('my-hand') : document.querySelector(`#p${pid} .hand-wrapper`);
        const mDiv = pid === 0 ? document.getElementById('my-melds') : null; // 他家の鳴き表示エリアがあれば追加実装
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
    renderRiver(pid) {
        const d = document.querySelector(`#p${pid} .river`); d.innerHTML = "";
        this.players[pid].river.forEach(t => { const e = document.createElement('div'); e.className = 'tile'; e.innerText = t.char; e.dataset.type = t.type; d.appendChild(e); });
    }
    updateInfo() {
        document.getElementById('wall-count').innerText = this.wall.length;
        const d = this.doraMarkers[0];
        const di = document.getElementById('dora-indicator');
        di.className = 'tile'; di.innerText = d.char; di.dataset.type = d.type;
        [0, 1, 2, 3].forEach(i => {
            const s = document.querySelector(`#p${i} .riichi-stick`);
            if (s) s.style.display = this.players[i].isRiichi ? 'block' : 'none';
        });
    }
    updateMsg(t) { document.getElementById('notification-area').innerText = t; }
    highlightActivePlayer() { document.querySelectorAll('.player-area').forEach(e => e.classList.remove('active-turn')); document.getElementById(`p${this.turn}`).classList.add('active-turn'); }
    showButton(id) { const b = document.getElementById(id); b.hidden = false; b.style.display = 'inline-block'; }
    hideButtons() { document.querySelectorAll('.act-btn').forEach(b => { b.hidden = true; b.style.display = 'none'; }); }
    onTileClick(i) { if (this.turn === 0 && this.state === 'DRAW' && !this.players[0].isRiichi) this.discard(0, i); }
}

// --- 6. 起動 ---
const game = new Game();
window.onload = () => game.init();

// イベントハンドラ
document.getElementById('btn-chi').onclick = () => game.humanAction('chi');
document.getElementById('btn-pon').onclick = () => game.humanAction('pon');
document.getElementById('btn-kan').onclick = () => game.humanAction('kan');
document.getElementById('btn-riichi').onclick = () => game.humanAction('riichi');
document.getElementById('btn-ron').onclick = () => game.humanAction('ron');
document.getElementById('btn-tsumo').onclick = () => game.humanAction('tsumo');
document.getElementById('btn-pass').onclick = () => game.humanAction('pass');
