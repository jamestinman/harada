# Compact (or simply "pact") / Combine / Contract
```sh
Compact com· pact ˈkäm-ˌpakt
An agreement or covenant between two or more parties
```
- Written by agents
- Non-deterministic blocks at runtime (but within boundaries controlled by 'contracts')
- 

## Questions
- With most code now written by AI, what does coding in the future look like?
    - Intended to be written by agents, but humans could
    - Easy for AI and humans to read / understand
- How do we control the AI for a given domain (i.e. bring the chaotic would of agentic AI _inside_ the program)
- How do we handle increasingly “messy” non-deterministic inputs and outcomes?
- What does documentation look like in the age of Agentic coding - documentation that no-one will read?
- What does testing look like when the AI updates tests at the same time as the code with the same logic (duplication)?
- What would AI want if it could design its own language? (designed in collaboration with Claude)
- How do I trust model derived code (or decision making) at runtime?

## Features
- **Run anywhere** Universally useful, can be ultimately run on the server, web or be compiled into a desktop application, mobile app, etc.
  - Compiles to HTML / CSS / JS out of the box for desktop / web / mobile deployments a la Spotify, AirBnB etc
  - Server-side pure JS via Node
  - Additional compilers in future (e.g. for machine code (via C, Go?))
- **Low token** incredibly lean: does away with token eating boilerplate, smaller codebases, cheaper AI costs, faster human reviewing
- **Low cruft** Built-in core functionality prevents import boilerplate; minimises external dependencies e.g.
  - "No state management boilerplate, no subscriptions, no observer pattern. It's reactive by default because stores and surfaces are both first-class."
  - stores - simple definition of something as a globally (or regionally) shared data or functionality
  - UI primitives that can be converted to e.g. html or apple or android native components
  - GPU access e.g. tensors without the need for third-party tool install
- **Interchangable LLM engines**
  - Setup requires an API key to run the compiler and use language features that employ LLMs  
  - can be tied to a particular model (with ai.lock) or allowed to “evolve”
- **Living Code**
  - ai blocks that aren't code but aren't prompts either; more a _contract_
  - Deterministic where it needs to be
  - Non-deterministic blocks that can be flexible and “intelligent” within boundaries (the “contract”)
- **Typing**
  - shouldn't have to annotate what's obvious from context
  - should be able to add constraints when they encode intent (not for the compiler's sake, but to signal to a future AI (or human) reader what was meant)
- **State / Data**
  - Built in
  - Implementation details abstracted
  - Compiler / runtime handles synchronization, persistence, and conflict resolution
- **Error intent**
  - First-class concept of intent (how to handle) errors e.g. fatal, recoverable (flag/log and continue), deferred (try again later)
- **Fine grained (block level) versioning**
  - AI-controlled code blocks are versioned at build time (either in the comments or a separate ai.lock file) e.g.
```
// auto-generated lockfile: ai.lock
[classifySentiment]
  resolved: 2026-04-10T14:30:00Z
  model: anthropic/claude-opus-4-6
  hash: a8f29c...
  tests_passed: 12/12
  fuzz_passed: 847/850 (99.6%)
```

## Comments
  - ARE the primary documentation layer
  - Structured with markdown (lean, and readily interpretable by LLMs)
  - The markdown isn't just a comment; it's a spec. Tooling can diff the spec against the implementation
  Premises:
    - Any function body could ostensibly be regenerated just from the comment
    - A human can read just the markdown and understand the system without parsing any code

## Testing
  - Folded into the code
  - examples are essential in _compact_ to formulate the code, but also act as tests
  - essential when the code upgrades / evolves

## AI blocks (contracts)
- intent
- constraints
- examples (that also serve as tests)
The boundary between written code and inferred code is fluid. Pact can choose to:
  - `ai:generate` Compile into a deterministic function at compile time (fast) e.g. an ISO 8601 date parser
  - `ai:interpret` Call an LLM each time at runtime (high overhead / handle any case) e.g. sentiment analysis
    - interpret can be optimised by caching code at runtime (if the constraints are tight enough)
  - `ai:orchestrate` LLM is able to thinking wider than it's "box", and call other functions (with permitted functions / forbidden functions explicitly stateable)

### How do you trust model derived code (or decision making) at runtime?
- Examples are baked in - these help understand intent and implement, but also serve as tests - if the code does not pass these at build time (whether at compile / runtime) it gets rejected
-  You don't trust the code; you trust the contract

Explictly control the generation (with `local`, `thinking`, `fast` defined in a config file pointing to actual models):
ai policy {
  deterministic -> prefer: local       // cheap, fast, predictable
  best_effort   -> prefer: thinking   // quality matters
  supervised    -> prefer: fast, require: human_approval
}

## Fine-grained (block level) versioning
- Compiler keeps track (in comments or ai.lock?) of AI used last (or all history?) to generate code
- Blocks can be "locked" to a version or allowed to "evolve"

## Evolution
- `evolve: true` on any ai block does not lock it to a specific version


Notes:
Thinking about how to handle comments. How about pact files are actually .md files, with the documentation surrounding ```pact blocks?

# Examples

## AI blocks

### generate (at build time)
```sh
fn parseDate(raw: String) -> Timestamp?
  ai generate
    intent: "Parse ISO 8601 date strings"
    constraints:
      - "Return none for invalid input, never throw"
    tests:
      "2026-04-15T10:30:00Z" -> Timestamp(2026,4,15,10,30,0,utc)
      "not a date"            -> none
```

### interpret (at runtime)
```sh
fn classifySentiment(text: String) -> Sentiment
  ai interpret
    intent: "Classify emotional sentiment"
    returns: one_of(Sentiment)
    confidence: 0.95
    evolve: true
```

## Orchestrate (runtime with tool calls)
```sh
fn handleSupport(request: String, ctx: CustomerContext) -> Resolution
  ai orchestrate
    intent: "Resolve customer support request"
    given: ctx.orderHistory, ctx.accountStatus
    permit: ctx.lookupOrder, ctx.applyCredit(max: 50.00)
    deny: ctx.deleteAccount, ctx.refund(above: 100.00)
    limits: { steps: 5, timeout: 30s, cost: 0.02 }
```

## Evolution
There are 2 types of evolution:
1. `evolve: true` on any block allows latest model to rebuild / compare outputs, speed of execution with existing implementation

2. Can rewrite entire code block (even at runtime) within contraints
```sh
evolve cart_pricing
  scope: fn calculateDiscount, fn applyPromoCode
  objective: "Minimise cart abandonment rate"
  measure: store global AnalyticsEvents
  constraints:
    - "Final price must always be mathematically correct"
    - "All existing tests must pass"
  review: human
  frequency: weekly
```

Combined evolve example:
```sh
fn generateImage(prompt: String, style: BrandStyle) -> Image
  ai interpret
    intent: "Generate a marketing image from a text description"
    constraints:
      - "Match brand colours and typography from {style}"
      - "Output at 1024x1024 minimum"
      - "No text in the image unless explicitly requested in prompt"
      - "Photorealistic style unless prompt specifies otherwise"
    given:
      style.palette
      style.guidelines
    cache: content_hash(prompt, style)
    evolve: true
    confidence: 0.8

evolve marketing_visuals
  scope: fn generateImage
  objective: "Maximise click-through rate on generated images"
  measure: store global MarketingAnalytics
    |> filter(.type == image_click)
    |> rate(per: day)
  constraints:
    - "Brand guidelines in BrandStyle must always be respected"
    - "Generated images must pass content safety check"
    - "Never alter the function signature"
  review: threshold(0.9)
  frequency: weekly
  max_drift: 1
```

### HelloWorld
```sh
greeting: store session
  value: String
  default: "World"

hello: view
  show input(greeting, placeholder: "Enter a name")
  show text("Hello, {greeting}!")
    style: emphasis

hello: force
  @input -> html: <input class="border-b-2 border-indigo-400 outline-none
                               px-2 py-1 text-lg" />
  @text  -> html: <p class="text-3xl font-bold text-indigo-600 mt-4">{}</p>
  ```