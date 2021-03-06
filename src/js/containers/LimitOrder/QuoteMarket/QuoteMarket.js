import React from "react"
import * as common from "../../../utils/common"
import * as converter from "../../../utils/converter"
import { connect } from "react-redux"
import * as limitOrderActions from "../../../actions/limitOrderActions"
import { SortableComponent } from "../../../components/CommonElement"
import limitOrderServices from "../../../services/limit_order";
import * as converters from "../../../utils/converter"
import { QuoteList, Search } from "../QuoteMarket"
import { sortQuotePriority } from "../../../utils/sorters";
import { getTranslate } from 'react-localize-redux'

@connect((store, props) => {
  const tokens = store.tokens.tokens
  const currentQuote = store.limitOrder.currentQuote
  const translate = getTranslate(store.locale)
  const pairs = store.market.tokens.reduce((result, pair) => { Object.assign(result, {[pair.pair]: pair}); return result},{})
  return {
    tokens, currentQuote, global: store.global, pairs, translate
  }
})
export default class QuoteMarket extends React.Component{
  constructor() {
    super()
    this.state = {
      quotes: {},
      pairs: {},
      favorite_pairs: [],
      current_search: "", 
      current_sort_index: "base", 
      current_sort_dsc: true,
      is_volume: false
    }
  }

  onQuoteClick = (quote) => {
    this.props.dispatch(limitOrderActions.updateCurrentQuote(quote))
    this.props.global.analytics.callTrack("trackLimitOrderClickChooseMarket", quote)
  }

  onSearch = (text) => {
    this.setState((state, props) => ({current_search: text}))
  }

  onSort = (i, isDsc) => {
    this.setState((state, props)=>({current_sort_index: i, current_sort_dsc: isDsc}))
  }
  
  search(quotes){
    const { current_search, current_sort_index, current_sort_dsc } = this.state
    const { currentQuote } = this.props
    const filtered = (
      currentQuote === "FAV" ?
        Object.keys(quotes).reduce((res, key) => res.concat(quotes[key]),[]).filter((pair) => pair["is_favorite"]) :
        quotes[currentQuote]
    )
      .filter(pair => (pair["base"].toLowerCase().includes(current_search.toLowerCase())))
    return current_sort_index == "base" ? filtered.sort(this.sortByBase) : filtered.sort(this.sortByDefault)
  }

  sortByBase = (a,b) => {
    const { current_sort_index, current_sort_dsc } = this.state
    return (current_sort_dsc ? -1 : 1) * (a[current_sort_index].replace("WETH", "ETH*") > b[current_sort_index].replace("WETH", "ETH*") ? 1 : -1)
  }

  sortByDefault = (a,b) => {
    const { current_sort_index, current_sort_dsc } = this.state
    return (current_sort_dsc ? -1 : 1) * converters.compareTwoNumber(a[current_sort_index], b[current_sort_index])
  }

  renderQuotes(){
    const { tokens, pairs } = this.props
    const fav = this.props.favorite_pairs

    const quotes = Object.keys(tokens).filter((key)=> (tokens[key]["is_quote"] && key !== "ETH"))
    .sort((first, second) => {
      return sortQuotePriority(tokens, first.replace("WETH", "ETH"), second.replace("WETH", "ETH"));
    });

    const result = quotes.reduce((res, quote) => {
        res[quote] = Object.keys(tokens).filter((key)=> (tokens[key]["sp_limit_order"] && key !== "ETH")).filter(key => {
          // if quote A priority < other quote priorities, remove other quotes from list token of quote A
          const quotePriority = tokens[quote].quote_priority;
          const tokenPriority = tokens[key].quote_priority;

          if (quotePriority && tokenPriority && quotePriority <= tokenPriority) {
            // remove from list
            return false;
          }
          return true;
        })
          .reduce((vt, key) =>{
            const pair = key+"_"+quote
            const pairReversed = `${quote}_${key}`
            const isExisted = (pairReversed in pairs)
            let volume
            if (isExisted){
              volume = converters.sumOfTwoNumber(pairs[pairReversed].volume, pairReversed.includes("WETH") ? pairs[pairReversed.replace("WETH", "ETH")].volume : 0)
              let round = 8 - converters.formatNumber(volume,0,'').toString().length
              round = round < 0 ? 0 : round
              volume = converters.formatNumber(volume, round, '')
            }
            return key == quote ? vt : vt.concat({
                id: pair,
                base: key, quote: quote,
                price: (isExisted ? converters.roundingRateNumber(pairs[pairReversed].buy_price) : "-"),
                is_favorite: fav.includes(pair),
                volume: isExisted ? volume : "-",
                change: (isExisted ? pairs[pairReversed].change : "-" )
            });
          }, []); 
        return res
      },{});
    return result;
  }

  renderTh = () => {
    let price = this.props.translate("limit_order.price") || "Price"
    let pair = this.props.translate("limit_order.pair") || "Pair"
    let volume = this.props.translate("limit_order.volume") || "Volume"
    let change = this.props.translate("limit_order.change") || "Change"
    const {is_volume} = this.state
    return [
      { html: pair, field: "base" }, 
      { html: price, field: "price" }, 
      { html: is_volume ? volume : change, field: is_volume ? "volume" : "change" },
    ].map((i, index) => (
      <div className={`c${index+1}`} key={i["html"]} >
        <SortableComponent 
          Wrapper={"span"}
          text={i["html"]}
          onClick={(is_dsc) => this.onSort(i["field"], is_dsc)}
          isActive={this.state.current_sort_index == i["field"]} />
      </div>
    ))
  }

  onPairClick = (base, quote) => {
    quote = quote === "ETH" ? "WETH" : quote
    this.props.selectSourceAndDestToken(quote, base);
    this.props.global.analytics.callTrack("trackLimitOrderClickSelectPair", base + "/" + quote)
    
    if (this.props.global.isOnMobile){
      this.props.dispatch(limitOrderActions.toogleQuoteMarket(false))
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
    }
  }
  render(){
    const quotes = this.renderQuotes()
    const {is_volume} = this.state
    const { tokens, currentQuote } = this.props
    const list = Object.keys(quotes).length > 0 ? this.search(quotes) : []

    return (
      <div id="quote-market" className="theme__background-2"> 
          { Object.keys(tokens).length > 0 ? 
            <div id="container">
              <div id="panel" className="theme__text-4 theme__border">
                <QuoteList onClick={this.onQuoteClick} currentQuote={currentQuote} quotes={Object.keys(quotes)}/>
                {currentQuote == "WETH" && <div className={"instruction"}>{this.props.translate("limit_order.eth_not_support") || "ETH* represents the sum of ETH & WETH for easy reference"}</div>}
                <Search onSearch={this.onSearch}/>
                <div className="volume_change_panel">
                  <div className="advance-config__option-container">
                    <label className="advance-config__option"><span className="advance-config__option-percent">{this.props.translate("limit_order.change") || "Change"}</span>
                      <input className="advance-config__radio" type="radio" name="volumeOrChange"
                             onChange={() => {if (this.state.is_volume) {this.setState({is_volume: false})}}}
                             checked={!this.state.is_volume} />
                      <span className="advance-config__checkmark theme__radio-button"></span>
                    </label>
                    <label className="advance-config__option"><span className="advance-config__option-percent">{this.props.translate("limit_order.volume") || "Volume"}</span>
                      <input className="advance-config__radio" type="radio" name="volumeOrChange"
                             onChange={() => {if (!this.state.is_volume) {this.setState({is_volume: true})}}}
                             checked={this.state.is_volume} />
                      <span className="advance-config__checkmark theme__radio-button"></span>
                    </label>
                  </div>

                </div>

              </div>
              <div className="table">
                <div className="table__header">
                  <div className="table__row">
                    <div className="c0"></div>
                    {this.renderTh()}
                  </div>
                </div>

                <div className="table__body">
                  {list.map(pair => <div key={pair["id"]} className="table__row" onClick={() => this.onPairClick(pair["base"], pair["quote"])}>
                    <div className="overlay"/>
                    <div className={"c0"} onClick={() => this.props.onFavoriteClick(pair["base"], pair["quote"], !pair["is_favorite"])}>
                      <div className={pair["is_favorite"] ? "star active" : "star" } />
                    </div>
                    <div className={"c1"} >{`${pair["base"]}/${pair["quote"]}`.replace("WETH", "ETH*")}</div>
                    <div className={"c2"} >{pair["price"] != 0 ? pair["price"] : '-'}</div>
                    <div className={`c3 ${is_volume ? "" : (pair["change"] < 0 ? "down" : "")} ${is_volume ? "" : (pair["change"] > 0 ? "up" : "")}`}>
                      {is_volume ? (pair["volume"] == "-" ? "-" : pair["volume"]) : (pair["change"] == '-' || pair["price"] == 0) ? '-' : `${pair["change"]}%`}
                    </div>
                  </div>)}
                </div>
              </div>
            </div> : 
            <div className="rate-loading"> <img src={require(`../../../../assets/img/${this.props.global.theme === 'dark' ? 'waiting-black' : 'waiting-white'}.svg`)} /></div>}
      </div>
    )
  }
}
