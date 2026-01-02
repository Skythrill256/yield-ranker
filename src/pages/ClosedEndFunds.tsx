import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";

function ClosedEndFunds() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="relative border-b overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-white to-blue-50/30" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_60%,rgba(59,130,246,0.03)_0%,transparent_50%)]" />

          <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-32 relative">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground">
                Closed End{" "}
                <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                  Funds
                </span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
                Understanding high-yield investment strategies
              </p>
            </div>
          </div>
        </section>

        <section className="container max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <Card className="p-8 md:p-12 border-2 border-slate-200 shadow-xl">
            <div className="prose prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
              <p>
                A Closed End Fund (CEF) is a type of investment company that raises capital through an initial public offering (IPO) and then trades on a stock exchange like a stock. Unlike open-end mutual funds, CEFs have a fixed number of shares and trade at prices that can be at a premium or discount to their Net Asset Value (NAV).
              </p>

              <p>
                CEFs are popular among income investors because they often pay high, regular dividends. Many CEFs pay dividends on a monthly or quarterly basis, with yields that can range from mid-single digits to over 15%. However, these dividends can change over time based on the fund's income from investments, option premiums, and other sources. These investments should be carefully evaluated based on both yield and total return performance.
              </p>

              <p>
                The Dividends and Total Returns website provides important information that investors can use, along with other research, to help make investment decisions. Besides metrics of dividends, yields, and payment frequency, the website includes key tools: the Dividend Volatility Index (DVI) metric shows how stable the dividend is over a specific time period, Premium/Discount metrics show whether the fund is trading above or below its NAV, and Total Return Tables provide the total return over several time periods, including 1 week, 1 month, 3 months, 6 months, 12 months, 3 years, 5 years, 10 years, and 15 years. This will allow users to sort by how stable the dividend is and to then see the yield and the total returns. Or users can sort by the yield to see the total returns and how stable the dividend is, etc.
              </p>

              <p>
                However, what might evolve into the most important tool of all is the Weighted Ranking tool. This feature will rank each CEF by a user determined weighting of 3 metrics: Yield, DVI and Total Returns. Once the subscriber decides on the weighting, the program will arrive at a score and then rank each CEF according to those scores. This feature is only available to FREE Premium subscribers, so recommend all users sign up for the FREE Premium plan.
              </p>

              <p>
                Some of the more popular CEF categories include bond funds, equity funds, covered call funds, and sector-specific funds from issuers like Nuveen, BlackRock, PIMCO, and others.
              </p>

              <h2 className="text-3xl font-bold text-slate-900 mt-12 mb-6">
                Table Field Descriptions
              </h2>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Symbol</h3>
                  <p>CEF symbol. Click to see Price/NAV chart and dividend history.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">NAV</h3>
                  <p>NAV symbol used to track Net Asset Value.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Description</h3>
                  <p>Description of the CEF.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">OPEN</h3>
                  <p>Fund opening/inception date.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">IPO Price</h3>
                  <p>Price at IPO. Colored green if current price is above IPO price.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">MP</h3>
                  <p>Market Price - current trading price.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">NAV</h3>
                  <p>Net Asset Value - the per-share value of the fund's assets.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Last Div</h3>
                  <p>Last announced or paid dividend per share. Click to view dividend history.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">#</h3>
                  <p>Number of payments paid during the year. 12 = monthly dividends. 4 = quarterly dividends.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Yrly Div</h3>
                  <p>Annual dividend amount.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">F Yield</h3>
                  <p>Forward Yield = Annual Dividend / Market Price.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Prem/Disc</h3>
                  <p>Premium/Discount percentage = ((Market Price - NAV) / NAV) × 100. Shows whether the fund is trading above (premium) or below (discount) its NAV.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">3 Yr Z-Score</h3>
                  <p>Z-Score measures how many standard deviations the current premium/discount is from its 3-year average. Higher values indicate the fund is trading at a significant premium compared to historical levels.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">12 Mo NAV Trend</h3>
                  <p>12-month NAV trend shows the percentage change in Net Asset Value over the past 12 months.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">12M NAV Return</h3>
                  <p>12-month NAV return shows the total return based on NAV changes over the past 12 months.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">DVI</h3>
                  <p>Dividend Volatility Index (DVI) provides a historical way to determine just how stable or volatile the distributions are. The lower the number the more stable they are. This is very important and it is a Premium (FREE) feature.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Weighted Rank</h3>
                  <p>Using Yield, Dividend Volatility Index (DVI) and Total Returns, the program will calculate a score to show the best CEF based on how I weigh each of the 3 metrics. This is a Premium (FREE) feature.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Total Returns</h3>
                  <p>This is the combined gain or loss from price change plus dividends paid during specific periods of time. The table provides total returns over several time periods, including 1 week, 1 month, 3 months, 6 months, 12 months, 3 years, 5 years, 10 years, and 15 years.</p>
                </div>
              </div>

              <h2 className="text-3xl font-bold text-slate-900 mt-12 mb-6">
                Data Sources & Calculations
              </h2>

              <p className="mb-6">
                The following table describes where each data field comes from and how calculated values are derived. All calculations are performed server-side and stored in the database.
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-slate-300 text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-4 py-2 text-left font-bold">Field Name</th>
                      <th className="border border-slate-300 px-4 py-2 text-left font-bold">Source</th>
                      <th className="border border-slate-300 px-4 py-2 text-left font-bold">Calculation / Formula</th>
                      <th className="border border-slate-300 px-4 py-2 text-left font-bold"># Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Symbol</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">RICH</span></td>
                      <td className="border border-slate-300 px-4 py-2">Manual upload from Excel</td>
                      <td className="border border-slate-300 px-4 py-2">1</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2">NAV Symbol</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">RICH</span></td>
                      <td className="border border-slate-300 px-4 py-2">Manual upload from Excel</td>
                      <td className="border border-slate-300 px-4 py-2">1</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Market Price (MP)</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">API</span></td>
                      <td className="border border-slate-300 px-4 py-2">Tiingo EOD close price</td>
                      <td className="border border-slate-300 px-4 py-2">~15 years</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2">NAV Value</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">API</span></td>
                      <td className="border border-slate-300 px-4 py-2">Tiingo NAV symbol close price</td>
                      <td className="border border-slate-300 px-4 py-2">~15 years</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Premium/Discount</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">CALC</span></td>
                      <td className="border border-slate-300 px-4 py-2">(Market Price / NAV - 1) × 100</td>
                      <td className="border border-slate-300 px-4 py-2">1 (latest)</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2">3-Year Z-Score</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">FORMULA</span></td>
                      <td className="border border-slate-300 px-4 py-2">(Current P/D - Mean P/D) / StdDev<sup>*</sup></td>
                      <td className="border border-slate-300 px-4 py-2">504-1260 days</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">NAV Trend 6M</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">CALC</span></td>
                      <td className="border border-slate-300 px-4 py-2">(NAV_now / NAV_126d_ago - 1) × 100</td>
                      <td className="border border-slate-300 px-4 py-2">126 trading days</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2">NAV Trend 12M</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">CALC</span></td>
                      <td className="border border-slate-300 px-4 py-2">(NAV_now / NAV_252d_ago - 1) × 100</td>
                      <td className="border border-slate-300 px-4 py-2">252 trading days</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Signal</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">FORMULA</span></td>
                      <td className="border border-slate-300 px-4 py-2">Logic gate scoring -2 to +3<sup>†</sup></td>
                      <td className="border border-slate-300 px-4 py-2">504+ days</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2">Total Returns</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">FORMULA</span></td>
                      <td className="border border-slate-300 px-4 py-2">Annualized CAGR from NAV adj_close<sup>‡</sup></td>
                      <td className="border border-slate-300 px-4 py-2">3Y, 5Y, 10Y, 15Y</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2">Last Dividend</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">API</span></td>
                      <td className="border border-slate-300 px-4 py-2">Tiingo dividend data</td>
                      <td className="border border-slate-300 px-4 py-2">1</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2">Forward Yield</td>
                      <td className="border border-slate-300 px-4 py-2"><span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">CALC</span></td>
                      <td className="border border-slate-300 px-4 py-2">Annual Dividend / Price × 100</td>
                      <td className="border border-slate-300 px-4 py-2">1</td>
                    </tr>
                    {/* DVI row removed per CEO request */}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 space-y-3 text-sm text-slate-600">
                <p><strong>Source Legend:</strong> <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">RICH</span> = Manual upload, <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">API</span> = Tiingo API, <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">CALC</span> = Simple calculation, <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">FORMULA</span> = Complex formula</p>

                <p><sup>*</sup> <strong>Z-Score:</strong> Uses 3-year lookback (max 756 trading days). Minimum 2 years (504 days) required. Returns N/A if insufficient history.</p>

                <p><sup>†</sup> <strong>Health Rating:</strong> Based on Z-Score, 6mo and 12mo NAV trend. <strong>High:</strong> 3 out of 3 rated as positive | <strong>Good:</strong> 2 out of 3 rated as positive | <strong>Low:</strong> 1 out of 3 rated as positive | <strong>Weak:</strong> 0 out of 3 rated as positive | <strong>N/A:</strong> Insufficient history (&lt;2 years)</p>

                <p><sup>‡</sup> <strong>Total Returns:</strong> For periods ≥1 year: ((End_AdjPrice / Start_AdjPrice)^(1/years) - 1) × 100 (Annualized CAGR). For periods &lt;1 year: ((End_AdjPrice / Start_AdjPrice) - 1) × 100.</p>
              </div>
            </div>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default ClosedEndFunds;

