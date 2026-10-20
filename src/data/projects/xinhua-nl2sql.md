---
{
  "slug": "xinhua-nl2sql",
  "title": "新华医疗｜自然语言数据库查询智能体",
  "context": "课题组与新华医疗合作项目",
  "period": "2025.05—2026.08",
  "summary": "以主 Agent 快速查询和多智能体按需生成，处理复杂医疗器械数据库的自然语言查询。",
  "role": "项目负责人；查询架构、智能体编排与检索优化",
  "outcomes": [
    {
      "id": "query-accuracy",
      "text": "整体查询正确率 97%",
      "emphasis": "97%"
    },
    {
      "id": "view-duration",
      "text": "View 命中场景 7min → 20s",
      "emphasis": "7min → 20s"
    }
  ],
  "tags": [
    "Python",
    "LangGraph",
    "Hybrid RAG",
    "SQL Server",
    "Skills / CLI"
  ],
  "order": 3,
  "links": [
    {
      "label": "项目源码",
      "url": "https://github.com/bupt-lxc/NL2SQL_XinHua"
    }
  ],
  "cover": "../../assets/projects/xinhua-query.jpeg",
  "coverAlt": "新华医疗｜自然语言数据库查询智能体项目截图",
  "primaryCapability": "agents",
  "secondaryEvidence": [],
  "card": {
    "contributions": [
      "负责主 Agent 查询与多智能体按需生成架构",
      "构建混合 RAG 与 Skills／CLI 查询链路并完成内网部署"
    ],
    "primaryOutcomeId": "query-accuracy",
    "secondaryOutcomeId": "view-duration",
    "tags": [
      "LangGraph",
      "Hybrid RAG",
      "SQL Server"
    ],
    "sourceLinkIndex": 0
  }
}
---


## 项目背景

新华医疗为医院提供手术器械解决方案及配套管理系统。客户的查询需求经常变化，开发人员需要不断适配特定需求的 SQL，处理大量零散的小需求。项目让使用者通过自然语言完成查询与统计，减少日常查询对开发适配的依赖。

例如，“查询 2024 年 5—7 月手术包出入库情况，并按出库人员统计月均使用数量”，可拆成两项查询，分别生成 SQL、执行并解释结果。


## 工作内容

我作为项目 Owner，负责查询架构、智能体编排与检索优化，设计主 Agent 快速查询与多智能体按需生成链路，并完成内网本地化部署。

- **组织复杂数据库知识**：针对百余张表、缺少外键和字段注释的业务数据库，梳理业务域与表间关系，结合 Multi-Query、BM25、HyDE、metadata 搜索与 Rerank 构成混合 RAG，提供相关结构和查询样例，减少无关信息对 SQL 生成的干扰。

- **复用业务查询能力**：将视图构建与日常查询分离，常规需求优先复用语义视图；未覆盖的需求交由多智能体完成意图拆解、结构规划、SQL 编写与审查，兼顾查询效率和复杂需求处理。

- **连接业务规则与执行工具**：将查询规则组织为 Skills，通过 CLI 工具衔接数据库操作，支持多需求拆解、查询与结果解释，并完成内网本地化部署。


## 效果与落地

整体查询正确率达 **97%**；Top-5 召回率由 **59% 提升至 83%**。View 命中场景耗时由 **7min 降至 20s**，在山东数家医院试点优化。


## 核心技术栈

Python · LangGraph · 混合 RAG · SQL Server · Skills／CLI · Qwen · vLLM

![xinhua-query.jpeg](../../assets/projects/xinhua-query.jpeg)

*输入“统计四月份不同科室的近似回收数量”，返回分科室统计结果。*
