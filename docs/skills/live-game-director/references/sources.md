# 运镜资料与采用范围

核查日期：2026-11-01。以下资料用于方法学习；项目内配方为结合游戏约束重新整理的设计。未安装或运行第三方技能脚本，也没有把商业引擎组件当作 Minecraft 的现成插件。

- [Cinematic Director Skill](https://github.com/wuwangzhang1216/DirectorSKILL/blob/main/SKILL.md)，社区作者 wangzhang-wu，前置元数据声明 MIT。采用镜头目的、调度、起止和连续性分开表达的思路；不采用其离线视频生成队列作为直播循环。
- [该技能的镜头语言参考](https://github.com/wuwangzhang1216/DirectorSKILL/blob/main/references/cinematic-language.md)。用于核对景别、角度与运动的不同含义；没有把电影镜头的焦距或成人眼高直接复制为 MC 参数。
- [StudioBinder：Camera Movements](https://www.studiobinder.com/camera-shots/camera-movements/)。核对推拉、摇移、升降和弧线运动的分类；直播场景是否使用由实际信息需求决定。
- [Adobe：180-degree rule](https://www.adobe.com/creativecloud/video/discover/what-is-the-180-degree-rule.html)。用于对话和动作的空间连续性；不是禁止有解释的连续跨轴运动。
- [Unity Cinemachine：Clear Shot](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineClearShot.html)。候选镜头质量、优先级、激活延迟和最短驻留机制可参考。
- [Unity Cinemachine：Deoccluder](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineDeoccluder.html)。区分只评分与主动避障，并控制遮挡持续时间、平滑和计算开销。
- [Unity Cinemachine：Orbital Follow](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineOrbitalFollow.html)。参考主体局部/世界坐标、半径、高度和旋转绑定的解耦；本项目仍需自己的轨迹执行器。
- [Unity Cinemachine：Position Composer](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachinePositionComposer.html)。参考构图区域、前视和阻尼；对网络噪声要保守，避免预测放大抖动。
- [Epic：Camera Cut Track](https://dev.epicgames.com/documentation/en-us/unreal-engine/cinematic-camera-cut-track-in-unreal-engine)。参考相机状态混合及切换期间的控制权保持；参数混合与两个画面的叠化仍需分开实现。
- [NBCU Academy：Technical Director](https://nbcuacademy.com/technical-director/)。区分内容与镜头选择、技术执行和真正播出的画面，保留导演/执行层的分工。
- [OBS：Studio Overview](https://obsproject.com/kb/OBS-Studio-Overview)。预览/节目分离及切换方式的依据；当前播出后端不是自动就具有 OBS 接口。

本机另有 spark-video-director，主要面向剧本、分镜和 AIGC 出片；其指向的 Shanyin 上游导演资料在当前安装中未找到。该事实不证明其他机器没有该资料，也不因此替直播工程创建虚假的离线剧集或生成任务。
