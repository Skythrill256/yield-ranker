import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";

export default function CoveredCallETFs() {
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
                Covered Call{" "}
                <span className="bg-gradient-to-r from-primary via-blue-600 to-accent bg-clip-text text-transparent">
                  Option ETFs
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
                A Covered Call Option ETF is a type of ETF that invests in a single stock or a portfolio of stocks (or other assets) and sells call options on those holdings to collect premiums, which provide additional income. The ETF aims to deliver regular income from the option premiums, dividends from the underlying stocks, and potential price appreciation, though the upside may be limited due to the call options.
              </p>

              <p>
                These funds are very popular as they can provide very high yields in a short time period as many funds are paying dividends on a monthly and weekly basis. These yields can range from high single digits to over 100%, however, dividends change every pay period and can change significantly as it is based on income from the option income. These investments should not be considered as buy and hold investments.
              </p>

              <p>
                The Dividends and Total Returns website provides important information that investors can use, along with other research, to help make Investment decisions. Besides metrics of dividends, yields, pay day, the website includes 2 key tools: the Dividend Volatility Index (DVI) metric shows how stable the dividend is over a specific time period and Total Return Tables provide the total return over several time periods, including 1 week, 1 month, 3 month, 6 month, 12 month and 3 years. This will allow users to sort by how stable the dividend is and to then see the yield and the total returns. Or users can sort by the yield to see the total returns and how stable the dividend is, etc.
              </p>

              <p>
                However, what might evolve into the most important tool of all is the Weighted Ranking tool. This feature will rank each ETF by a user determined weighting of 3 metrics: Yield, DVI and Total Returns. Once the subscriber decides on the weighting, the program will arrive at a score and then rank each ETF according to those scores. This feature is only available to FREE Premium subscribers, so recommend all users sign up for the FREE Premium plan.
              </p>

              <p>
                Some of the more popular funds are provided by Yieldmax, Roundhill, Neos, Rex Funds, Granite and others.
              </p>

              <h2 className="text-3xl font-bold text-slate-900 mt-12 mb-6">
                Table Field Descriptions
              </h2>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Symbol</h3>
                  <p>ETF symbol. Click to see Total Return and Price Return chart. Able to compare up to 5 ETFs.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">IPO Price</h3>
                  <p>Price at IPO. Colored green if current price is above IPO price.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Issuer</h3>
                  <p>Name of company issuing the ETF.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Desc</h3>
                  <p>Description of the ETF.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Pay Day</h3>
                  <p>Many ETFs now pay on weekly basis. This provides the day payment is made.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Price</h3>
                  <p>Last price.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Price Change</h3>
                  <p>Change from previous day ending price.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Dividend</h3>
                  <p>Last announced or paid dividend per share.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2"># Pmts</h3>
                  <p>Number of payments paid during the year. 12 = monthly dividends. 52 = weekly dividends.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Annual Dividend</h3>
                  <p>Dividend  X  #Pmts = Annual Dividend.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Forward Yield</h3>
                  <p>Annual Dividend / Price = Yield.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Dividend Volatility Index (DVI)</h3>
                  <p>Covered Call Option ETF dividends change every pay period. Some ETFs have stable distributions and others are much more volatile. The Dividend Volatility Index (DVI) provides a historical way to determine just how stable or volatile the distributions are. The lower the number the more stable they are. This is very important and it is a Premium (FREE) feature.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Weighted Rank</h3>
                  <p>Using Yield, Dividend Volatility Index (DVI) and Total Returns, the program will calculate a score to show the best ETF based on how I weigh each of the 3 metrics. This is a Premium (FREE) feature.</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Total Returns</h3>
                  <p>This is the combined gain or loss from price change plus dividends paid during specific periods of time. The table provides total returns over several time periods, including 1 week, 1 month, 3 months, 6 months, 12 months and 3 years.</p>
                </div>
              </div>
            </div>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}

